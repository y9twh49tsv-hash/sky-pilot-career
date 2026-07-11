/**
 * Procedural placeholder audio built on WebAudio oscillators — no asset files.
 * Engine pitch/volume follows RPM, wind follows airspeed, plus one-shot beeps
 * for stall, gear, flaps, checkpoints, touchdown and crash.
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windOsc = null;
    this.windGain = null;
    this.stallOsc = null;
    this.stallGain = null;
    this.stallActive = false;
    this.muted = false;
  }

  async unlock() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    await this.ctx.resume();
    this.setupLoops();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  setupLoops() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // Engine: two slightly detuned saws through a lowpass — reads as a
    // piston engine instead of a raw buzzer. Filter opens with RPM.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 0.8;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.02;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc.start();
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.detune.value = 12;
    this.engineOsc2.connect(this.engineFilter);
    this.engineOsc2.start();

    // Wind: looped white noise through a bandpass that rises with airspeed.
    const noiseLen = 2 * ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = noiseBuf;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 300;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windSource.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.windSource.start();

    this.stallOsc = ctx.createOscillator();
    this.stallOsc.type = 'square';
    this.stallGain = ctx.createGain();
    this.stallGain.gain.value = 0.0;
    this.stallOsc.connect(this.stallGain).connect(this.master);
    this.stallOsc.frequency.value = 820;
    this.stallOsc.start();
  }

  /** rpm is normalized engine power 0..1 (lags throttle via spool). */
  engine(rpm, speedKt) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const freq = 42 + rpm * 118;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2.01, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(320 + rpm * 1400, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.012 + rpm * 0.075, t, 0.04);
    this.windFilter.frequency.setTargetAtTime(220 + speedKt * 6, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, Math.pow(speedKt / 320, 1.6) * 0.11), t, 0.12);
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
    osc.connect(amp).connect(this.master);
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
