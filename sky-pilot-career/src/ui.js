import { DEG, FT, MS_TO_KT, NM } from './constants.js';
import { clamp, headingDeg, formatNumber, lerp } from './utils.js';
import { checkpointDistanceNm, currentCheckpoint, objectiveText } from './missions.js';
import { loadSave } from './storage.js';

const el = (id) => document.getElementById(id);

export class GameUI {
  constructor() {
    this.fpsSmooth = 60;
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

  bind({ onMissionStart, onFreeFlight, onRestart, onBackToMenu }) {
    el('startMission').addEventListener('click', onMissionStart);
    el('freeFlight').addEventListener('click', onFreeFlight);
    el('restart').addEventListener('click', onRestart);
    el('backToMenu').addEventListener('click', onBackToMenu);
    el('hideHelp').addEventListener('click', () => el('help').style.display = 'none');
  }

  refreshMenuStats() {
    const save = loadSave();
    el('bestScore').textContent = save.bestScore;
    el('bestLanding').textContent = save.bestLanding === null ? '—' : `${save.bestLanding} fpm`;
    el('missionsDone').textContent = save.missionsDone;
    el('money').textContent = formatNumber(save.money);
  }

  showMenu() {
    this.refreshMenuStats();
    this.elements.menu.classList.add('visible');
    this.elements.hud.classList.add('hidden');
    this.elements.message.classList.remove('visible');
  }

  showGame() {
    this.elements.menu.classList.remove('visible');
    this.elements.message.classList.remove('visible');
    this.elements.hud.classList.remove('hidden');
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
    el('rpm').textContent = Math.round(820 + sim.throttle * 2650);
    el('thr').textContent = Math.round(sim.throttle * 100);
    el('fuelFlow').textContent = (1.4 + sim.throttle * 24.0).toFixed(1);
    el('flaps').textContent = sim.flaps;
    el('gear').textContent = sim.gearDown ? 'DOWN' : 'UP';
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
    if (speedKt > 310) warnings.push('OVERSPEED');
    if (!sim.gearDown && altFt < 450 && speedKt < 115 && !sim.onGround) warnings.push('GEAR');
    if (sim.fuel < 0.10) warnings.push('LOW FUEL');
    if (sim.onGround && sim.brakes && sim.throttle > 0.55) warnings.push('BRAKES');
    el('warnings').innerHTML = warnings.map(w => `<div class="warning-pill">${w}</div>`).join('');

    const cp = currentCheckpoint(sim);
    this.elements.checkpointMarker.style.display = cp ? 'block' : 'none';
  }
}
