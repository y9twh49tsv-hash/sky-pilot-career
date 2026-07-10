export class GameAudio {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windOsc = null;
    this.windGain = null;
    this.stallOsc = null;
    this.stallGain = null;
    this.stallActive = false;
  }

  async unlock() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    await this.ctx.resume();
    this.setupLoops();
  }

  setupLoops() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.02;
    this.engineOsc.connect(this.engineGain).connect(ctx.destination);
    this.engineOsc.start();

    this.windOsc = ctx.createOscillator();
    this.windOsc.type = 'triangle';
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windOsc.connect(this.windGain).connect(ctx.destination);
    this.windOsc.start();

    this.stallOsc = ctx.createOscillator();
    this.stallOsc.type = 'square';
    this.stallGain = ctx.createGain();
    this.stallGain.gain.value = 0.0;
    this.stallOsc.connect(this.stallGain).connect(ctx.destination);
    this.stallOsc.frequency.value = 820;
    this.stallOsc.start();
  }

  engine(throttle, speedKt) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + throttle * 145, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.015 + throttle * 0.065, t, 0.04);
    this.windOsc.frequency.setTargetAtTime(120 + speedKt * 2.1, t, 0.06);
    this.windGain.gain.setTargetAtTime(Math.min(0.04, speedKt / 7000), t, 0.08);
  }

  stall(active) {
    if (!this.ctx || !this.stallGain || this.stallActive === active) return;
    this.stallActive = active;
    this.stallGain.gain.setTargetAtTime(active ? 0.045 : 0.0, this.ctx.currentTime, 0.02);
  }

  beep(freq = 480, duration = 0.12, gain = 0.045) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp).connect(this.ctx.destination);
    osc.start();
    amp.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration + 0.02);
  }

  checkpoint() { this.beep(760, 0.16, 0.065); }
  flaps() { this.beep(360, 0.1, 0.035); }
  gear() { this.beep(240, 0.18, 0.045); }
  touchdown(force) { this.beep(force > 3.5 ? 130 : 210, 0.18, 0.06); }
  crash() { this.beep(90, 0.5, 0.085); }
}
