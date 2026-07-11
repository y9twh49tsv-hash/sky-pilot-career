import { DEG, FT, MS_TO_KT, NM } from './constants.js';
import { clamp, headingDeg, formatNumber, lerp } from './utils.js';
import { checkpointDistanceNm, currentCheckpoint, missionOne, objectiveText } from './missions.js';
import { loadSave, loadSettings, saveSettings, pilotLevel } from './storage.js';

const el = (id) => document.getElementById(id);
const MENU_VIEWS = ['menuMain', 'menuCareer', 'menuControls', 'menuSettings'];

export class GameUI {
  constructor() {
    this.fpsSmooth = 60;
    this.settings = loadSettings();
    this.minimap = el('minimap');
    this.minimapCtx = this.minimap.getContext('2d');
    this.toastTimer = null;
    this.elements = {
      menu: el('menu'),
      hud: el('hud'),
      message: el('message'),
      modeLabel: el('modeLabel'),
      objective: el('objective'),
      checkpointMarker: el('checkpointMarker'),
      scorePanel: el('scorePanel')
    };
  }

  bind({ onMissionStart, onFreeFlight, onRestart, onBackToMenu, onSettingsChange }) {
    this.onSettingsChange = onSettingsChange;

    el('btnCareer').addEventListener('click', () => this.showMenuView('menuCareer'));
    el('btnControls').addEventListener('click', () => this.showMenuView('menuControls'));
    el('btnSettings').addEventListener('click', () => this.showMenuView('menuSettings'));
    for (const btn of document.querySelectorAll('[data-back]')) {
      btn.addEventListener('click', () => this.showMenuView('menuMain'));
    }

    el('startMission').addEventListener('click', onMissionStart);
    el('btnFreeFlight').addEventListener('click', onFreeFlight);
    el('restart').addEventListener('click', onRestart);
    el('backToMenu').addEventListener('click', onBackToMenu);
    el('hideHelp').addEventListener('click', () => el('help').style.display = 'none');

    // Settings controls: reflect stored values, persist and apply on change.
    el('setQuality').value = this.settings.quality;
    el('setSound').checked = this.settings.sound;
    el('setHelp').checked = this.settings.showHelp;
    const applySettings = () => {
      this.settings = {
        quality: el('setQuality').value,
        sound: el('setSound').checked,
        showHelp: el('setHelp').checked
      };
      saveSettings(this.settings);
      this.onSettingsChange?.(this.settings);
    };
    el('setQuality').addEventListener('change', applySettings);
    el('setSound').addEventListener('change', applySettings);
    el('setHelp').addEventListener('change', applySettings);
  }

  showMenuView(viewId) {
    for (const id of MENU_VIEWS) el(id).classList.toggle('hidden', id !== viewId);
  }

  refreshMenuStats() {
    const save = loadSave();
    el('bestScore').textContent = save.bestScore;
    el('careerBest').textContent = save.bestScore;
    el('careerLanding').textContent = save.bestLanding === null ? '—' : `${save.bestLanding} fpm`;
    el('missionsDone').textContent = save.missionsDone;
    el('pilotXp').textContent = formatNumber(save.xp);
    el('pilotLevel').textContent = pilotLevel(save.xp);
    el('menuMoney').textContent = formatNumber(save.money);
    el('money').textContent = formatNumber(save.money);
  }

  showMenu() {
    this.refreshMenuStats();
    this.showMenuView('menuMain');
    this.elements.menu.classList.add('visible');
    this.elements.hud.classList.add('hidden');
    this.elements.message.classList.remove('visible');
  }

  showGame() {
    this.elements.menu.classList.remove('visible');
    this.elements.message.classList.remove('visible');
    this.elements.hud.classList.remove('hidden');
    el('help').style.display = this.settings.showHelp ? '' : 'none';
  }

  showCrash(reason) {
    el('resultEyebrow').textContent = 'Flug abgebrochen';
    el('messageTitle').textContent = 'Crash';
    el('messageText').textContent = `${reason}. Tipp: Endanflug mit 65–80 kt, Flaps 20–30°, Sinkrate unter 700 ft/min, Fahrwerk unten.`;
    this.elements.scorePanel.classList.add('hidden');
    this.elements.message.classList.add('visible');
  }

  showMissionComplete(result) {
    el('resultEyebrow').textContent = 'Mission abgeschlossen';
    el('messageTitle').textContent = result.score >= 760 ? 'Sehr gute Landung' : result.score >= 520 ? 'Mission geschafft' : 'Gelandet, aber ausbaufähig';
    el('messageText').textContent = `Du hast Runway 27 erreicht. Score: ${result.score}/1000. Belohnung: €${formatNumber(result.money)} und ${result.xp} XP.`;
    this.elements.scorePanel.innerHTML = `
      <div><strong>${result.score}</strong><small>Score</small></div>
      <div><strong>${result.verticalSpeedFpm}</strong><small>Touchdown fpm</small></div>
      <div><strong>${result.touchdownSpeedKt}</strong><small>Touchdown kt</small></div>
      <div><strong>${result.centerlineError} m</strong><small>Centerline error</small></div>
    `;
    this.elements.scorePanel.classList.remove('hidden');
    this.elements.message.classList.add('visible');
  }

  updateHud(sim, cameraRig, dt) {
    const airVel = sim.velocity.clone().sub(sim.wind);
    const speedKt = Math.max(0, airVel.length() * MS_TO_KT);
    const altFt = Math.max(0, sim.position.y * FT);
    const vsFpm = sim.velocity.y * FT * 60;

    el('ias').textContent = Math.round(speedKt);
    el('alt').textContent = formatNumber(altFt);
    el('vs').textContent = formatNumber(vsFpm);
    el('hdg').textContent = headingDeg(sim.yaw);
    el('pitch').textContent = Math.round(sim.pitch / DEG);
    el('bank').textContent = Math.round(sim.roll / DEG);
    el('rpm').textContent = Math.round(820 + sim.rpm * 2650);
    el('thr').textContent = Math.round(sim.throttle * 100);
    el('fuelFlow').textContent = (1.4 + sim.rpm * 24.0).toFixed(1);
    el('flaps').textContent = Math.round(sim.flapsPos);
    el('gear').textContent = sim.gearPos > 0.95 ? 'DOWN' : sim.gearPos < 0.05 ? 'UP' : 'TRANSIT';
    el('brakes').textContent = sim.brakes ? 'ON' : 'OFF';
    el('aoa').textContent = (sim.alpha / DEG).toFixed(1);
    el('gload').textContent = sim.gload.toFixed(1);
    el('checkpointDist').textContent = checkpointDistanceNm(sim).toFixed(1);
    el('rwyDist').textContent = (Math.sqrt(sim.position.x * sim.position.x + sim.position.z * sim.position.z) / NM).toFixed(1);
    el('camMode').textContent = cameraRig.modeName();
    el('lift').textContent = Math.round(clamp(sim.liftN / (sim.mass * 9.80665) * 100, 0, 240));
    el('drag').textContent = Math.round(clamp(sim.dragN / 2500 * 100, 0, 260));
    el('wind').textContent = Math.round(sim.wind.length() * MS_TO_KT);
    el('trim').textContent = Math.round(sim.trim / DEG);
    el('fuelQty').textContent = Math.round(sim.fuel * 100);
    el('state').textContent = sim.paused ? 'PAUSED' : sim.state;
    this.fpsSmooth = lerp(this.fpsSmooth, 1 / Math.max(dt, 0.001), 0.08);
    el('fps').textContent = Math.round(this.fpsSmooth);
    el('speedMeter').style.width = clamp(speedKt / 340 * 100, 0, 100) + '%';
    el('thrMeter').style.width = Math.round(sim.throttle * 100) + '%';
    el('horizonLine').style.transform = `translate(-50%, ${clamp(sim.pitch / DEG * 4, -130, 130)}px) rotate(${-sim.roll / DEG}deg)`;
    this.elements.modeLabel.textContent = sim.missionMode ? 'MISSION' : 'FREE FLIGHT';
    this.elements.objective.textContent = objectiveText(sim);

    const warnings = [];
    if (sim.paused) warnings.push('PAUSED');
    if (sim.stall) warnings.push('STALL');
    else if (sim.stallWarn) warnings.push('STALL WARNING');
    if (sim.overspeedWarn) warnings.push('OVERSPEED');
    if (!sim.gearDown && altFt < 450 && speedKt < 115 && !sim.onGround) warnings.push('GEAR');
    if (sim.fuel <= 0) warnings.push('FUEL EMPTY');
    else if (sim.fuel < 0.10) warnings.push('LOW FUEL');
    if (sim.onGround && sim.brakes && sim.throttle > 0.55) warnings.push('BRAKES');
    el('warnings').innerHTML = warnings.map(w => `<div class="warning-pill">${w}</div>`).join('');

    const cp = currentCheckpoint(sim);
    this.elements.checkpointMarker.style.display = cp ? 'block' : 'none';
    this.drawMinimap(sim);
  }

  /** Short auto-hiding notification pill (checkpoint reached, etc.). */
  showToast(text) {
    const toast = el('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /** North-up circular minimap: runway, lake, city, checkpoints, aircraft. */
  drawMinimap(sim) {
    const c = this.minimapCtx;
    const scale = 96 / 3200; // ±3.2 km of world on the disc
    const px = (x) => 100 + x * scale;
    const py = (z) => 100 + z * scale;
    c.clearRect(0, 0, 200, 200);
    c.save();
    c.beginPath();
    c.arc(100, 100, 98, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(5, 13, 22, 0.78)';
    c.fillRect(0, 0, 200, 200);
    // Lake
    c.fillStyle = 'rgba(52, 120, 168, 0.8)';
    c.beginPath();
    c.arc(px(-1450), py(1300), 690 * scale, 0, Math.PI * 2);
    c.fill();
    // City
    c.fillStyle = 'rgba(150, 160, 175, 0.5)';
    c.fillRect(px(550), py(500), 950 * scale, 950 * scale);
    // Runway
    c.fillStyle = '#dfe7ee';
    c.fillRect(px(-48), py(-1225), 96 * scale, 2450 * scale);
    // Checkpoints (mission only): done = dim, current = bright ring
    if (sim.missionMode) {
      missionOne.checkpoints.forEach((cp, i) => {
        const done = i < sim.checkpointIndex;
        const current = i === sim.checkpointIndex;
        c.beginPath();
        c.arc(px(cp.position.x), py(cp.position.z), current ? 5 : 3, 0, Math.PI * 2);
        c.fillStyle = done ? 'rgba(113,255,155,0.45)' : current ? '#ffda79' : 'rgba(255,218,121,0.5)';
        c.fill();
        if (current) {
          c.strokeStyle = '#ffda79';
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(px(cp.position.x), py(cp.position.z), 8, 0, Math.PI * 2);
          c.stroke();
        }
      });
    }
    // Aircraft arrow
    c.save();
    c.translate(px(sim.position.x), py(sim.position.z));
    c.rotate(-sim.yaw);
    c.fillStyle = '#71ff9b';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();
    // Bezel
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(100, 100, 97, 0, Math.PI * 2);
    c.stroke();
  }
}
