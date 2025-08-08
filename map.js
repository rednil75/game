// map.js - animations for flights and interactive routes
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayers = {}; // polylines by route id
let flightAnimations = {}; // active animations by route id

async function initMap() {
  await waitForGameData();
  const { routes } = window.GAME_STATE;
  const cities = {};
  routes.forEach(r => {
    cities[r.from.name] = r.from;
    cities[r.to.name] = r.to;
  });
  // add city markers
  Object.values(cities).forEach(c => {
    const m = L.circleMarker([c.lat, c.lon], {radius:6, weight:1}).addTo(map);
    m.bindPopup(`<strong>${c.name}</strong><br/>Population: ${c.pop || 'n/a'}`);
  });
  // draw routes
  routes.forEach(r => {
    const from = [r.from.lat, r.from.lon];
    const to = [r.to.lat, r.to.lon];
    const poly = L.polyline([from, to], { weight: 2, opacity: 0.7 }).addTo(map);
    poly.on('click', ()=> onRouteClick(r, poly));
    routeLayers[r.id] = poly;
    refreshRouteVisual(r.id);
  });
  // observe route changes
  window.onRouteChange = function(routeId) {
    refreshRouteVisual(routeId);
    manageFlightAnimation(routeId);
  };
  // initial flight animations for already open routes
  Object.keys(window.GAME_STATE.openRoutes).forEach(k=>manageFlightAnimation(k));
}

// wait for game data
function waitForGameData() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    function check() {
      attempts++;
      if (window.GAME_STATE && window.GAME_STATE.routes) return resolve();
      if (attempts > 100) return reject('GAME_STATE not ready');
      setTimeout(check, 100);
    }
    check();
  });
}

function onRouteClick(route, poly) {
  const state = window.GAME_STATE.openRoutes[route.id];
  const info = `
    <div>
      <strong>${route.from.name} → ${route.to.name}</strong><br/>
      Distance: ${route.distance_km} km<br/>
      Demand: ${route.demand || 'n/a'}<br/>
      Price factor: ${route.price_factor || 0.2}<br/>
      Status: ${state ? state.status : 'closed'}<br/>
      Planes assignés: ${state ? state.planesAssigned : 0}<br/>
      <div style="margin-top:8px;">
        <button onclick="window.buyRoute('${route.id}')">Ouvrir la route</button>
        <button onclick="window.closeRoute('${route.id}')">Fermer la route</button>
        <button onclick="window.assignPlaneToRoute('${route.id}')">Ajouter avion</button>
        <button onclick="window.releasePlaneFromRoute('${route.id}')">Retirer avion</button>
      </div>
    </div>`;
  poly.bindPopup(info).openPopup();
  // also update left detail panel
  if (window.onRouteSelected) window.onRouteSelected(info);
}

// Visual refresh
function refreshRouteVisual(routeId) {
  const poly = routeLayers[routeId];
  if (!poly) return;
  const state = window.GAME_STATE.openRoutes[routeId];
  let color = 'gray';
  let dash = false;
  if (state && state.open) {
    if (state.status === 'operational') color = 'green';
    else if (state.status === 'suspended_weather') { color = 'orange'; dash = true; }
    else if (state.status === 'suspended_security') { color = 'red'; dash = true; }
    else color = 'blue';
  } else color = 'gray';
  poly.setStyle({ color, dashArray: dash ? '6' : null, weight: 3 });
}

// Manage flight animations: create markers that travel along polyline when route is operational
function manageFlightAnimation(routeId) {
  const state = window.GAME_STATE.openRoutes[routeId];
  const poly = routeLayers[routeId];
  // stop existing animation if any
  if (flightAnimations[routeId]) {
    flightAnimations[routeId].stop();
    delete flightAnimations[routeId];
  }
  if (!state || !state.open || state.status && state.status.startsWith('suspended')) return;
  if (state.planesAssigned <= 0) return;
  // create a simple animation: a marker moves along the line and loops. One marker per assigned plane up to 3 for performance.
  const latlngs = poly.getLatLngs();
  if (!latlngs || latlngs.length < 2) return;
  const markers = [];
  const markerCount = Math.min(3, state.planesAssigned);
  for (let i=0;i<markerCount;i++) {
    const m = L.circleMarker(latlngs[0], {radius:4, weight:0}).addTo(map);
    markers.push({ marker: m, offset: i/(markerCount) });
  }
  let progress = 0;
  let stopped = false;
  function step() {
    if (stopped) return;
    progress += 0.006 + Math.random()*0.004; // speed variability
    if (progress > 1) progress = 0;
    markers.forEach((mp, idx) => {
      // compute t with offset so markers are spaced
      let t = (progress + mp.offset) % 1;
      const p = interpolateLatLngs(latlngs, t);
      mp.marker.setLatLng(p);
    });
    requestAnimationFrame(step);
  }
  step();
  flightAnimations[routeId] = {
    stop: ()=>{ stopped = true; markers.forEach(m=>map.removeLayer(m.marker)); }
  };
}

// Helper to interpolate along polyline points
function interpolateLatLngs(latlngs, t) {
  if (t<=0) return latlngs[0];
  if (t>=1) return latlngs[latlngs.length-1];
  // measure segments lengths
  let total = 0;
  const seg = [];
  for (let i=0;i<latlngs.length-1;i++) {
    const a = latlngs[i], b = latlngs[i+1];
    const d = a.distanceTo(b);
    seg.push(d);
    total += d;
  }
  let target = t * total;
  let acc = 0;
  for (let i=0;i<seg.length;i++) {
    if (acc + seg[i] >= target) {
      const a = latlngs[i], b = latlngs[i+1];
      const remain = target - acc;
      const frac = seg[i]===0?0:remain/seg[i];
      const lat = a.lat + (b.lat - a.lat) * frac;
      const lng = a.lng + (b.lng - a.lng) * frac;
      return L.latLng(lat, lng);
    }
    acc += seg[i];
  }
  return latlngs[latlngs.length-1];
}

initMap().catch(e=>console.error('Erreur init map', e));
