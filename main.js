// main.js - v3: Advanced AI competitors, market share tracking, interactive tutorial
// --- Game state ---
let year = 1985;
let money = 100000000;
let reputation = 55;
let fuelPrice = 0.22;
let globalEvents = [];
let fleet = [];
let routes = [];
let openRoutes = {};
let maintenanceFactor = 0.008;
let demandSensitivity = 0.9;
let airportFeePerKm = 0.015;
let incidentBaseProb = 0.0015;

// --- Competitor AI (advanced) ---
let competitors = []; // will hold objects with strategy profiles

const AI_PROFILES = {
  hub: { name: 'Hub Focus', description: 'Concentre sur hubs majeurs et connexions long-courrier', aggro: 1.0 },
  lowcost: { name: 'Low-Cost', description: 'Flotte légère, concurrence locale agressive', aggro: 1.3 },
  premium: { name: 'Premium', description: 'Recherche de réputation et routes longues', aggro: 0.8 }
};

// Difficulty presets
const DIFFICULTY_SETTINGS = {
  easy:    { maintenanceFactor: 0.006, fuelBase: 0.18, demandSensitivity: 0.8, incidentMult: 0.6, competitorAggro: 0.7 },
  normal:  { maintenanceFactor: 0.008, fuelBase: 0.22, demandSensitivity: 0.9, incidentMult: 1.0, competitorAggro: 1.0 },
  hard:    { maintenanceFactor: 0.012, fuelBase: 0.26, demandSensitivity: 1.05, incidentMult: 1.4, competitorAggro: 1.4 }
};
let currentDifficulty = 'normal';

// Tutorial state
let tutorialActive = false;
let tutorialStep = 0;
const TUTORIAL_STEPS = [
  { title: 'Bienvenue', text: 'Bienvenue dans la simulation. Ce tutoriel te montrera les actions de base.' },
  { title: 'Ressources', text: 'En haut, tu peux voir Année, Argent, Réputation, Prix du carburant et taille de la flotte.' },
  { title: 'Ouvrir une route', text: 'Clique sur une ligne sur la carte, puis sur "Ouvrir la route" pour commencer l\'exploitation.' },
  { title: 'Acheter un avion', text: 'Utilise le magasin d\'avions sur la gauche pour acheter un appareil et l\'assigner à une route.' },
  { title: 'Terminer un tour', text: 'Clique sur "Next Turn" pour avancer d\'une année et voir l\'impact de tes choix.' },
  { title: 'Bonne chance', text: 'Tu es prêt. Amuse-toi !' }
];

// --- Helpers and initialization ---
async function loadData() {
  const fleetResp = await fetch('data/fleet.json');
  fleet = await fleetResp.json();
  const routesResp = await fetch('data/data/routes.json');
  routes = await routesResp.json();
  routes.forEach(r => { if (!openRoutes[r.id]) openRoutes[r.id] = { open:false, planesAssigned:0, status:'closed' }; });
  initCompetitorsAdvanced();
  updateUI();
  window.GAME_STATE = getGameState();
  // render initial market share
  if (window.renderMarketShare) window.renderMarketShare();
}

// get snapshot for map
function getGameState() { return { year, money, reputation, fuelPrice, fleet, routes, openRoutes, competitors }; }
function updateGameStateForMap() { window.GAME_STATE = getGameState(); }

function updateUI() {
  document.getElementById('year').innerText = year;
  document.getElementById('money').innerText = `$${Math.round(money).toLocaleString()}`;
  document.getElementById('reputation').innerText = reputation.toFixed(0);
  document.getElementById('fuelPrice').innerText = fuelPrice.toFixed(3);
  const fleetCount = fleet.reduce((s,p)=>s+(p.count||0),0);
  document.getElementById('fleet').innerText = fleetCount;
  updateGameStateForMap();
  if (window.renderMarketShare) window.renderMarketShare();
}

// Difficulty setter
function setDifficulty(level) {
  if (!DIFFICULTY_SETTINGS[level]) return;
  currentDifficulty = level;
  const s = DIFFICULTY_SETTINGS[level];
  maintenanceFactor = s.maintenanceFactor;
  fuelPrice = s.fuelBase;
  demandSensitivity = s.demandSensitivity;
  incidentBaseProb = 0.0015 * s.incidentMult;
  if (window.addEvent) window.addEvent(`Difficulté: ${level}`);
  updateUI();
}

// --- Advanced competitors initialization ---
function initCompetitorsAdvanced() {
  // create 3 competitors with different AI strategy profiles
  competitors = [
    { id:'globex', name:'Globex Airlines', strategy:'hub', money:80000000, reputation:62, openRoutes:{}, fleetValue:40000000, alliances:[], aggro:1.0 },
    { id:'skylink', name:'SkyLink', strategy:'lowcost', money:50000000, reputation:48, openRoutes:{}, fleetValue:25000000, alliances:[], aggro:1.1 },
    { id:'aeromax', name:'AeroMax', strategy:'premium', money:30000000, reputation:58, openRoutes:{}, fleetValue:15000000, alliances:[], aggro:0.9 }
  ];
  // initialize their openRoutes keys
  routes.forEach(r=>{ competitors.forEach(c=>c.openRoutes[r.id]=false); });
}

// --- Market share calculation ---
function calculateMarketShare() {
  // compute revenue proxy per operator (player + competitors) per route and aggregate by operator
  const scores = {}; // key: operator id ('player' or competitor id) -> score
  scores['player'] = 0;
  competitors.forEach(c=>scores[c.id]=0);
  routes.forEach(r=>{
    const dist = r.distance_km || 1000;
    const baseDemand = r.demand || 120;
    // approximate passengers demand for route overall based on global reputation (player influence only for simplicity)
    const totalRep = Math.max(10, reputation + competitors.reduce((s,c)=>s+c.reputation,0));
    const totalPassengers = Math.round(baseDemand * Math.pow(Math.max(0.1, totalRep/ (50 * (1+competitors.length)) ), demandSensitivity) * (1 + (Math.random()-0.5)*0.1));
    // split passengers among operators open on route weighted by reputation and presence
    const operators = [];
    if (openRoutes[r.id] && openRoutes[r.id].open) operators.push({ id:'player', rep: reputation, weight: openRoutes[r.id].planesAssigned || 1 });
    competitors.forEach(c=>{ if (c.openRoutes && c.openRoutes[r.id]) operators.push({ id:c.id, rep: c.reputation, weight: 1 }); });
    if (operators.length===0) return;
    // compute weights
    let totalWeight = operators.reduce((s,o)=>s + (o.rep*o.weight),0);
    if (totalWeight <= 0) totalWeight = operators.length;
    operators.forEach(o=>{
      const share = (o.rep*o.weight)/totalWeight;
      const passengersForOp = Math.round(totalPassengers * share);
      scores[o.id] = (scores[o.id] || 0) + passengersForOp * dist; // weighted by distance to favor long routes
    });
  });
  // normalize into percentages
  const totalScore = Object.values(scores).reduce((s,v)=>s+v,0) || 1;
  const market = {};
  Object.keys(scores).forEach(k=> market[k] = Math.round(1000 * scores[k] / totalScore)/10 );
  return market; // e.g. { player: 45.3, globex: 30.1, ... }
}

// Render market share simple table (UI hook)
function renderMarketShareUI() {
  const panel = document.getElementById('market-share');
  if (!panel) return;
  const market = calculateMarketShare();
  let html = '<h3>Parts de marché (%)</h3><table class="market-table"><tr><th>Opérateur</th><th>Part</th></tr>';
  html += `<tr><td>Toi</td><td>${market.player||0}%</td></tr>`;
  competitors.forEach(c=> html += `<tr><td>${c.name}</td><td>${market[c.id]||0}%</td></tr>`);
  html += '</table>';
  panel.innerHTML = html;
}

// --- Competitor AI behavior (more strategic) ---
function competitorTurnsAdvanced() {
  const settings = DIFFICULTY_SETTINGS[currentDifficulty];
  competitors.forEach(comp => {
    // yearly income from fleetValue
    comp.money += Math.round(comp.fleetValue * 0.02);
    // reputation drift
    comp.reputation = Math.max(10, Math.min(95, comp.reputation + (Math.random()-0.45)*2 * (comp.strategy==='premium'?0.6:1)));
    const profile = AI_PROFILES[comp.strategy] || AI_PROFILES.hub;
    // Alliances: if low cash, seek alliance with another competitor
    if (comp.money < 10000000 && Math.random() < 0.2) {
      const partner = competitors.find(c=>c.id!==comp.id && !comp.alliances.includes(c.id) && Math.random()<0.4);
      if (partner) { comp.alliances.push(partner.id); partner.alliances.push(comp.id); if (window.addEvent) window.addEvent(`${comp.name} forme une alliance avec ${partner.name}`); }
    }
    // Strategy: hub -> open routes linking to big hubs; lowcost -> open short routes; premium -> target long routes with high rep
    const candidateRoutes = routes.filter(r=> !comp.openRoutes[r.id]);
    let filtered = candidateRoutes;
    if (comp.strategy==='hub') filtered = candidateRoutes.filter(r=> (r.from.pop>2000000 || r.to.pop>2000000));
    if (comp.strategy==='lowcost') filtered = candidateRoutes.filter(r=> r.distance_km < 1500);
    if (comp.strategy==='premium') filtered = candidateRoutes.filter(r=> r.distance_km > 2500);
    if (filtered.length>0 && Math.random() < 0.45 * settings.competitorAggro * comp.aggro) {
      const pick = filtered[Math.floor(Math.random()*filtered.length)];
      const cost = pick.setup_cost || 50000;
      if (comp.money > cost + 1000000) {
        comp.openRoutes[pick.id] = true;
        comp.money -= cost;
        comp.fleetValue += 1500000;
        if (window.addEvent) window.addEvent(`${comp.name} ouvre ${pick.from.name}→${pick.to.name}`);
      }
    }
    // Occasionally attack competitor's route (if not allied)
    if (Math.random() < 0.05 * settings.competitorAggro) {
      const target = competitors.find(c=>c.id!==comp.id && !comp.alliances.includes(c.id) && Object.keys(c.openRoutes).length>0);
      if (target) {
        const keys = Object.keys(target.openRoutes).filter(k=> target.openRoutes[k]);
        if (keys.length>0 && Math.random()<0.4) {
          const k = keys[Math.floor(Math.random()*keys.length)];
          // open on same route to compete
          if (!comp.openRoutes[k]) { comp.openRoutes[k] = true; if (window.addEvent) window.addEvent(`${comp.name} attaque la route ${k} de ${target.name}`); }
        }
      }
    }
    // invest in fleet occasionally
    if (Math.random() < 0.3 && comp.money > 2000000) {
      comp.fleetValue += 1000000;
      comp.money -= 1000000;
      if (window.addEvent) window.addEvent(`${comp.name} investit dans la flotte`);
    }
    // sometimes drop unprofitable routes
    Object.keys(comp.openRoutes).forEach(rid=>{
      if (comp.openRoutes[rid] && Math.random()<0.03) {
        comp.openRoutes[rid] = false;
        if (window.addEvent) window.addEvent(`${comp.name} ferme une route peu rentable`);
      }
    });
  });
  // update UI market share
  if (window.renderMarketShare) window.renderMarketShare();
}

// --- Revenue and costs (player) ---
function collectRevenue() {
  let revenue = 0, cost = 0;
  routes.forEach(r=>{
    const s = openRoutes[r.id];
    if (!s || !s.open) return;
    if (s.status && s.status.startsWith('suspended')) return;
    const baseDemand = r.demand || 120;
    const dist = r.distance_km || 1000;
    // competitor count on route
    let competitorCountOnRoute = 0;
    competitors.forEach(c=>{ if (c.openRoutes && c.openRoutes[r.id]) competitorCountOnRoute += 1; });
    const competitionFactor = Math.max(0.45, 1 - 0.12 * competitorCountOnRoute);
    const repFactor = Math.pow(Math.max(0.1, reputation/50), demandSensitivity);
    const passengers = Math.max(0, Math.round(baseDemand * repFactor * competitionFactor * (1 + (Math.random()-0.5)*0.16)));
    const revPerPassenger = Math.max(30, Math.round(dist * (r.price_factor || 0.18)));
    const routeRevenue = passengers * revPerPassenger;
    revenue += routeRevenue;
    const fuelCost = passengers * dist * fuelPrice * (r.fuel_multiplier||0.0012);
    const airportFees = Math.round(dist * airportFeePerKm) * (s.planesAssigned || 1);
    cost += fuelCost + airportFees;
    if (Math.random() < Math.min(0.02, incidentBaseProb + dist/90000)) {
      const incidentCost = Math.round(Math.random()*90000);
      cost += incidentCost; reputation -= 1;
      globalEvents.push({ year, type:'incident', cost:incidentCost, route:r.id });
      if (window.addEvent) window.addEvent(`Incident: ${r.from.name}→${r.to.name} (${incidentCost}$)`);
    }
  });
  money += revenue - cost;
  if (revenue - cost > 150000) reputation = Math.min(100, reputation + 1);
  if (money < 0) reputation = Math.max(0, reputation - 3);
}

// --- Maintenance (same as before) ---
function applyMaintenance() {
  fleet.forEach(p => {
    const age = p.age || 0;
    const costPerPlane = (p.value || 10000000) * maintenanceFactor * (1 + age*0.06);
    const total = costPerPlane * (p.count||0);
    money -= total;
    if (age > (p.lifetime || 25) && p.count > 0) {
      p.count -= 1;
      const salvage = Math.round((p.value||0)*0.15);
      money += salvage;
      globalEvents.push({ year, type:'retire', model:p.model, salvage });
      if (window.addEvent) window.addEvent(`Retrait: ${p.model} (récup ${salvage}$)`);
      reputation -= 0.5;
    }
    p.age = age + 1;
  });
}

// --- Tutorial control ---
function startTutorial() {
  tutorialActive = true;
  tutorialStep = 0;
  showTutorialStep();
  if (window.addEvent) window.addEvent('Tutoriel démarré');
}
function showTutorialStep() {
  const s = TUTORIAL_STEPS[tutorialStep];
  if (!s) return endTutorial();
  // show a popup-like element in UI if available
  if (window.showPopup) window.showPopup(s.title, s.text, ()=>{ nextTutorialStep(); });
  else { alert(s.title + '\n\n' + s.text); nextTutorialStep(); }
}
function nextTutorialStep() {
  tutorialStep += 1;
  if (tutorialStep >= TUTORIAL_STEPS.length) return endTutorial();
  showTutorialStep();
}
function endTutorial() {
  tutorialActive = false;
  tutorialStep = 0;
  if (window.addEvent) window.addEvent('Tutoriel terminé');
  if (window.hidePopup) window.hidePopup();
}

// --- Open/close/assign/buy functions (unchanged logic but kept) ---
function buyRoute(routeId) {
  const r = routes.find(x=>x.id===routeId); if (!r) { alert('Route non trouvée'); return; }
  const state = openRoutes[routeId]; if (state.open) { alert('La route est déjà ouverte.'); return; }
  const openCost = (r.setup_cost || 50000); if (money < openCost) { alert('Fonds insuffisants'); return; }
  money -= openCost; state.open = true; state.planesAssigned = 1; state.status='operational'; reputation += 0.5;
  globalEvents.push({year,type:'route_opened',route:routeId,cost:openCost}); updateUI(); if (window.onRouteChange) window.onRouteChange(routeId); if (window.addEvent) window.addEvent(`Route ouverte: ${r.from.name}→${r.to.name}`);
}
function closeRoute(routeId) { const state = openRoutes[routeId]; if (!state || !state.open) return; state.open=false; state.planesAssigned=0; state.status='closed'; reputation-=0.2; updateUI(); if (window.onRouteChange) window.onRouteChange(routeId); if (window.addEvent) window.addEvent(`Route fermée: ${routeId}`); }
function assignPlaneToRoute(routeId) { const state = openRoutes[routeId]; if (!state || !state.open) return alert('Route non ouverte'); const plane = fleet.find(p=>p.count>0); if (!plane) return alert('Aucun avion disponible'); plane.count -= 1; state.planesAssigned += 1; updateUI(); if (window.onRouteChange) window.onRouteChange(routeId); }
function releasePlaneFromRoute(routeId) { const state = openRoutes[routeId]; if (!state || state.planesAssigned<=0) return; const plane = fleet[0]; plane.count += 1; state.planesAssigned -= 1; updateUI(); if (window.onRouteChange) window.onRouteChange(routeId); }
function buyPlane(modelId) { const model = fleet.find(p=>p.model===modelId); if (!model) return alert('Modèle introuvable'); const price = model.value || 10000000; if (money < price) return alert('Fonds insuffisants'); money -= price; model.count = (model.count||0) + 1; if (window.addEvent) window.addEvent('Achat: ' + model.model + ' — ' + price + '$'); updateUI(); }

// --- Random events ---
function handleRandomEvents() {
  if (Math.random() < 0.006 * (currentDifficulty==='hard'?1.6:1)) { fuelPrice *= 1.3 + Math.random()*0.6; globalEvents.push({year,type:'fuel_crisis',impact:fuelPrice}); reputation -= 2; if (window.addEvent) window.addEvent('Crise pétrolière soudaine'); }
  routes.forEach(r=>{ if (Math.random() < 0.03) { const s = openRoutes[r.id]; if (s && s.open) { s.status='suspended_weather'; globalEvents.push({year,type:'weather_closure',route:r.id}); if (window.addEvent) window.addEvent(`Clôture météo: ${r.from.name}→${r.to.name}`); } } else { const s = openRoutes[r.id]; if (s && s.status === 'suspended_weather') s.status = 'operational'; } });
}

// --- Historical events ---
function processHistoricalEvents() {
  const hist = [ { y:1986, id:'chernobyl', effect:()=>{ reputation -= 1; fuelPrice *= 1.05; return 'Chernobyl (1986)'; } }, { y:1990, id:'gulfwar', effect:()=>{ fuelPrice *= 1.4; reputation -=3; return 'Crise du Golfe (1990)'; } }, { y:2001, id:'sept11', effect:()=>{ reputation -=10; Object.keys(openRoutes).forEach(k=>{ if (Math.random()<0.4) openRoutes[k].status='suspended_security'; }); return '11 Septembre (2001)'; } }, { y:2008, id:'fincrisis', effect:()=>{ reputation -=4; fuelPrice *= 0.9; return 'Crise financière (2008)'; } } ];
  hist.forEach(h=>{ if (h.y === year) { const msg = h.effect(); globalEvents.push({year,type:'historical',msg}); if (window.addEvent) window.addEvent('Événement historique: '+msg); } });
}

// --- Turn advancement (AI + player) ---
function nextTurn() {
  year += 1;
  // competitors take actions
  competitorTurnsAdvanced();
  // fluctuating fuel
  fluctuateFuelPrice();
  // revenue and costs for player
  collectRevenue();
  // maintenance
  applyMaintenance();
  // random events and historical events
  handleRandomEvents();
  processHistoricalEvents();
  // reputation drift
  reputation = Math.max(0, Math.min(100, reputation + (Math.random()-0.5)*1.4));
  updateUI();
}

// fluctuate fuel (simple)
function fluctuateFuelPrice() { const change = (Math.random()-0.5)*0.06; fuelPrice *= (1 + change); fuelPrice = Math.max(0.05, Math.min(2.0, fuelPrice)); }

// --- Expose UI hooks ---
window.buyRoute = buyRoute; window.closeRoute = closeRoute; window.assignPlaneToRoute = assignPlaneToRoute; window.releasePlaneFromRoute = releasePlaneFromRoute;
window.buyPlane = buyPlane; window.nextTurn = nextTurn; window.startTutorial = startTutorial; window.setDifficulty = setDifficulty;
window.calculateMarketShare = calculateMarketShare; window.renderMarketShare = renderMarketShareUI; window.competitors = competitors; window.globalEvents = globalEvents;
window.updateUI = updateUI;

// initialize
loadData().catch(e=>console.error('Erreur chargement données', e));
