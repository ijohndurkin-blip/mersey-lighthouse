/**
 * Fully procedural audio: an original island theme, ambient soundscape and SFX,
 * synthesised with WebAudio (no audio files to load or license).
 */
import type { Surface } from '../world/terrain';

export type Mood = 'title' | 'explore' | 'puzzle' | 'night' | 'finale' | 'quiet';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// 16 bars x 8 eighth-notes. 0 = rest, -1 = hold
const MELODY: number[] = [
  69, -1, 74, -1, 78, -1, 76, 74,
  76, -1, 73, -1, 69, -1, -1, -1,
  78, -1, 74, -1, 71, -1, 74, 76,
  74, -1, 71, -1, 67, -1, 69, -1,
  71, -1, 74, -1, 79, -1, 78, 76,
  78, -1, -1, 76, 74, -1, 69, -1,
  67, 69, 71, -1, 76, -1, 74, -1,
  73, -1, -1, -1, 69, -1, -1, -1,
  69, -1, 74, -1, 78, -1, 76, 74,
  76, -1, 73, -1, 69, -1, 71, 73,
  74, -1, 78, -1, 81, -1, 79, 78,
  79, -1, 76, -1, 74, -1, 71, -1,
  71, -1, 74, -1, 79, -1, 78, 76,
  78, -1, 81, -1, 78, -1, 74, -1,
  76, -1, 74, -1, 73, -1, 71, 73,
  74, -1, -1, -1, 0, 0, 0, 0,
];
// chord roots per bar (as triads, midi)
const CHORDS: number[][] = [
  [62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62],
  [55, 59, 62], [62, 66, 69], [64, 67, 71], [57, 61, 64],
  [62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62],
  [55, 59, 62], [62, 66, 69], [57, 61, 64], [62, 66, 69],
];

interface MoodMix {
  bpm: number;
  melody: number;
  chords: number;
  bass: number;
  drums: number;
  pad: number;
  bells: number;
  brass: number;
}
const MIX: Record<Mood, MoodMix> = {
  title: { bpm: 92, melody: 0.8, chords: 0.6, bass: 0.5, drums: 0, pad: 0.6, bells: 0.3, brass: 0 },
  explore: { bpm: 104, melody: 0.75, chords: 0.7, bass: 0.75, drums: 0.6, pad: 0.15, bells: 0, brass: 0 },
  puzzle: { bpm: 92, melody: 0, chords: 0.55, bass: 0.45, drums: 0.25, pad: 0.35, bells: 0.55, brass: 0 },
  night: { bpm: 84, melody: 0, chords: 0.4, bass: 0.4, drums: 0, pad: 0.7, bells: 0.6, brass: 0 },
  finale: { bpm: 112, melody: 0.9, chords: 0.8, bass: 0.9, drums: 0.9, pad: 0.4, bells: 0.4, brass: 0.9 },
  quiet: { bpm: 90, melody: 0, chords: 0, bass: 0, drums: 0, pad: 0.25, bells: 0, brass: 0 },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  private groups: Record<string, GainNode> = {};
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  mood: Mood = 'title';
  private seqStep = 0;
  private nextTime = 0;
  private timer: number | null = null;
  musicVol = 0.6;
  sfxVol = 0.85;
  muted = false;
  private waveGain!: GainNode;
  private windGain!: GainNode;
  private streamGain!: GainNode;
  private humGain!: GainNode;
  private nextGull = 4;
  private nextBird = 2;
  ambient = { coast: 1, stream: 0, wind: 0.4, birds: 1, hum: 0 };

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem('mm.audio') || '{}');
      if (typeof s.music === 'number') this.musicVol = s.music;
      if (typeof s.sfx === 'number') this.sfxVol = s.sfx;
      if (typeof s.muted === 'boolean') this.muted = s.muted;
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.5;
    this.sfxBus.gain.value = this.sfxVol;
    this.ambBus.gain.value = this.sfxVol * 0.7;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    // buffers
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    // small reverb
    this.reverb = ctx.createConvolver();
    const rl = ctx.sampleRate * 1.6;
    const ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < rl; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.25;
    this.reverbSend.connect(this.reverb).connect(this.master);
    // music groups
    for (const g of ['melody', 'chords', 'bass', 'drums', 'pad', 'bells', 'brass']) {
      const n = ctx.createGain();
      n.gain.value = 0;
      n.connect(this.musicBus);
      if (g !== 'bass' && g !== 'drums') n.connect(this.reverbSend);
      this.groups[g] = n;
    }
    this.startAmbient();
    this.setMood(this.mood, true);
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  saveSettings() {
    try {
      localStorage.setItem('mm.audio', JSON.stringify({ music: this.musicVol, sfx: this.sfxVol, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.1);
      this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.1);
      this.ambBus.gain.setTargetAtTime(sfx * 0.7, this.ctx.currentTime, 0.1);
    }
    this.saveSettings();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
    this.saveSettings();
  }

  setMood(m: Mood, instant = false) {
    this.mood = m;
    if (!this.ctx) return;
    const mix = MIX[m];
    const t = this.ctx.currentTime;
    for (const g of Object.keys(this.groups)) {
      const v = (mix as any)[g] as number;
      this.groups[g].gain.cancelScheduledValues(t);
      this.groups[g].gain.setTargetAtTime(v, t, instant ? 0.01 : 1.2);
    }
  }

  // --------------------------------------------------------------------------
  // Music sequencer
  // --------------------------------------------------------------------------
  private schedule() {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    const mix = MIX[this.mood];
    const stepDur = 60 / mix.bpm / 2;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.seqStep, this.nextTime, stepDur);
      this.seqStep = (this.seqStep + 1) % (16 * 8);
      this.nextTime += stepDur;
    }
  }

  private playStep(step: number, t: number, sd: number) {
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const chord = CHORDS[bar];
    const g = this.groups;
    const mix = MIX[this.mood];
    // melody
    const n = MELODY[step];
    if (n > 0 && mix.melody > 0) {
      let len = 1;
      while (MELODY[(step + len) % MELODY.length] === -1 && len < 8) len++;
      this.whistle(n, t, sd * len * 0.95, g.melody);
    }
    if (n > 0 && mix.brass > 0) this.brass(n - 12, t, sd * 1.6, g.brass);
    // chords: ukulele-ish strum on beats, arpeggio in puzzle/night
    if (mix.chords > 0) {
      if (this.mood === 'puzzle' || this.mood === 'night') {
        const arp = [0, 1, 2, 1, 0, 2, 1, 2];
        this.marimba(chord[arp[beat]] + 12, t, g.chords, 0.22);
      } else if (beat === 0 || beat === 3 || beat === 4 || beat === 6) {
        chord.forEach((c, i) => this.pluck(c + 12, t + i * 0.012, g.chords, beat === 0 ? 0.13 : 0.08));
      }
    }
    // bass
    if (mix.bass > 0 && (beat === 0 || beat === 4 || (this.mood !== 'night' && beat === 6))) {
      const root = chord[0] - 24;
      this.bassNote(beat === 4 ? root + 7 : root, t, sd * 1.8, g.bass);
    }
    // drums
    if (mix.drums > 0) {
      if (beat === 0 || beat === 4) this.kick(t, g.drums);
      if (beat === 2 || beat === 6) this.snap(t, g.drums);
      this.shaker(t, g.drums, beat % 2 ? 0.04 : 0.07);
    }
    // pad on bar starts
    if (beat === 0 && mix.pad > 0) chord.forEach((c) => this.pad(c, t, sd * 8, g.pad));
    // bells: sparkle on some beats
    if (mix.bells > 0 && (beat === 0 || beat === 5) && (bar % 2 === 0 || beat === 0)) {
      const note = chord[(bar + beat) % 3] + 24;
      this.bell(note, t, g.bells);
    }
    // finale timpani
    if (this.mood === 'finale' && beat === 0 && bar % 4 === 0) this.timpani(chord[0] - 24, t, g.brass);
  }

  private env(gain: GainNode, t: number, a: number, peak: number, dec: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private whistle(n: number, t: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vg = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sine';
    o2.type = 'triangle';
    o.frequency.value = midi(n);
    o2.frequency.value = midi(n) * 2;
    vib.frequency.value = 5.5;
    vg.gain.value = midi(n) * 0.006;
    vib.connect(vg);
    vg.connect(o.frequency);
    const g2 = ctx.createGain();
    g2.gain.value = 0.08;
    o2.connect(g2).connect(g);
    o.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.04);
    g.gain.setValueAtTime(0.14, t + Math.max(0.05, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    for (const x of [o, o2, vib]) {
      x.start(t);
      x.stop(t + dur + 0.1);
    }
  }

  private pluck(n: number, t: number, out: AudioNode, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = midi(n);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    o.connect(f).connect(g).connect(out);
    this.env(g, t, 0.005, vol, 0.45);
    o.start(t);
    o.stop(t + 0.5);
  }

  private marimba(n: number, t: number, out: AudioNode, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    o.type = 'sine';
    o2.type = 'sine';
    o.frequency.value = midi(n);
    o2.frequency.value = midi(n) * 4;
    o.connect(g).connect(out);
    o2.connect(g2).connect(out);
    this.env(g, t, 0.003, vol * 0.6, 0.5);
    this.env(g2, t, 0.002, vol * 0.12, 0.08);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.6);
    o2.stop(t + 0.15);
  }

  private bell(n: number, t: number, out: AudioNode) {
    const ctx = this.ctx!;
    for (const [ratio, v, d] of [
      [1, 0.08, 1.6],
      [2.76, 0.03, 0.6],
      [5.4, 0.015, 0.3],
    ]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = midi(n) * ratio;
      o.connect(g).connect(out);
      this.env(g, t, 0.003, v, d);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  private bassNote(n: number, t: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = midi(n);
    f.type = 'lowpass';
    f.frequency.value = 600;
    o.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.6));
    o.start(t);
    o.stop(t + 0.7);
  }

  private pad(n: number, t: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    f.connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
  }

  private brass(n: number, t: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.08);
    f.frequency.exponentialRampToValueAtTime(900, t + dur);
    o.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private timpani(n: number, t: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(midi(n) * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(midi(n), t + 0.2);
    o.connect(g).connect(out);
    this.env(g, t, 0.005, 0.4, 1.0);
    o.start(t);
    o.stop(t + 1.1);
  }

  private kick(t: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g).connect(out);
    this.env(g, t, 0.002, 0.35, 0.18);
    o.start(t);
    o.stop(t + 0.22);
  }

  private noise(t: number, dur: number, out: AudioNode, type: BiquadFilterType, freq: number, vol: number, q = 1, buf?: AudioBuffer) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf ?? this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(out);
    this.env(g, t, 0.002, vol, dur);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return { s, f, g };
  }

  private snap(t: number, out: AudioNode) {
    this.noise(t, 0.08, out, 'bandpass', 1800, 0.18, 1.2);
  }
  private shaker(t: number, out: AudioNode, v: number) {
    this.noise(t, 0.05, out, 'highpass', 7000, v);
  }

  // --------------------------------------------------------------------------
  // Ambient soundscape
  // --------------------------------------------------------------------------
  private loopNoise(buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(this.ambBus);
    s.start();
    return { g, f };
  }

  private startAmbient() {
    const ctx = this.ctx!;
    const waves = this.loopNoise(this.brownBuf, 'lowpass', 700, 0.5);
    this.waveGain = waves.g;
    // slow swell LFO on the waves
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(waves.g.gain);
    lfo.start();
    const wind = this.loopNoise(this.noiseBuf, 'bandpass', 500, 0.4);
    this.windGain = wind.g;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.07;
    const wlg = ctx.createGain();
    wlg.gain.value = 250;
    wl.connect(wlg).connect(wind.f.frequency);
    wl.start();
    const stream = this.loopNoise(this.noiseBuf, 'bandpass', 2400, 0.7);
    this.streamGain = stream.g;
    // electrical hum for the energy system
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 300;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    o.connect(hf).connect(this.humGain).connect(this.ambBus);
    o.start();
  }

  updateAmbient(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const a = this.ambient;
    this.waveGain.gain.setTargetAtTime(0.28 * a.coast + 0.05, t, 0.5);
    this.windGain.gain.setTargetAtTime(0.05 + a.wind * 0.08, t, 0.5);
    this.streamGain.gain.setTargetAtTime(a.stream * 0.12, t, 0.3);
    this.humGain.gain.setTargetAtTime(a.hum * 0.05, t, 0.3);
    this.nextGull -= dt;
    if (this.nextGull < 0) {
      this.nextGull = 5 + Math.random() * 9;
      if (a.coast > 0.25) this.gull(Math.random() * 2 - 1, 0.5 * a.coast);
    }
    this.nextBird -= dt;
    if (this.nextBird < 0) {
      this.nextBird = 1.5 + Math.random() * 4;
      if (a.birds > 0.2) this.chirp(Math.random() * 2 - 1, 0.25 * a.birds);
    }
  }

  private panner(pan: number, out: AudioNode) {
    const p = this.ctx!.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    return p;
  }

  gull(pan = 0, vol = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const calls = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < calls; i++) {
      const s = t + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 3;
      const g = ctx.createGain();
      const base = 1100 + Math.random() * 300;
      o.frequency.setValueAtTime(base, s);
      o.frequency.linearRampToValueAtTime(base * 1.35, s + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, s + 0.26);
      o.connect(f).connect(g).connect(this.panner(pan, this.ambBus));
      this.env(g, s, 0.02, vol * 0.25, 0.26);
      o.start(s);
      o.stop(s + 0.3);
    }
  }

  chirp(pan = 0, vol = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.05);
      o.connect(g).connect(this.panner(pan, this.ambBus));
      this.env(g, s, 0.005, vol * 0.12, 0.06);
      o.start(s);
      o.stop(s + 0.08);
    }
  }

  // --------------------------------------------------------------------------
  // Sound effects
  // --------------------------------------------------------------------------
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0, out?: AudioNode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(g).connect(out ?? this.sfxBus);
    this.env(g, t, 0.005, vol, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step(surface: Surface, run: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = run ? 1 : 0.7;
    switch (surface) {
      case 'wood':
        this.noise(t, 0.06, this.sfxBus, 'bandpass', 520, 0.32 * v, 3);
        this.tone(170 + Math.random() * 30, 0.06, 'triangle', 0.12 * v);
        break;
      case 'stone':
      case 'path':
        this.noise(t, 0.05, this.sfxBus, 'bandpass', surface === 'stone' ? 2200 : 1300, 0.2 * v, 1.5);
        break;
      case 'sand':
        this.noise(t, 0.09, this.sfxBus, 'highpass', 3500, 0.12 * v);
        break;
      default:
        this.noise(t, 0.08, this.sfxBus, 'lowpass', 900 + Math.random() * 300, 0.22 * v);
    }
  }

  jump() {
    this.tone(320, 0.18, 'sine', 0.14, 620);
  }
  land() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.12, this.sfxBus, 'lowpass', 500, 0.35);
  }
  click() {
    this.tone(900, 0.05, 'triangle', 0.12, 1300);
  }
  select() {
    this.tone(660, 0.08, 'triangle', 0.15, 990);
  }
  place() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.07, this.sfxBus, 'bandpass', 700, 0.4, 4);
    this.tone(220, 0.1, 'triangle', 0.2, 180);
  }
  wood() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.09, this.sfxBus, 'bandpass', 450 + Math.random() * 200, 0.45, 5);
    this.tone(150 + Math.random() * 40, 0.12, 'triangle', 0.22, 120);
  }
  oops() {
    this.tone(330, 0.16, 'sine', 0.18, 260);
    this.tone(260, 0.24, 'sine', 0.16, 200, 0.14);
  }
  boing() {
    this.tone(180, 0.35, 'sine', 0.25, 520);
  }
  splash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.6, this.sfxBus, 'lowpass', 1800, 0.45);
    this.noise(t + 0.05, 0.3, this.sfxBus, 'highpass', 4000, 0.15);
  }
  pickup() {
    [784, 988, 1175].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, undefined, i * 0.07));
  }
  starfish() {
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.12, undefined, i * 0.06));
  }
  success() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.17, undefined, i * 0.09));
  }
  bigSuccess() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, i === seq.length - 1 ? 0.9 : 0.22, 'triangle', 0.18, undefined, i * 0.11));
    seq.forEach((f, i) => this.tone(f / 2, 0.3, 'sine', 0.1, undefined, i * 0.11));
  }
  gearClick() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.03, this.sfxBus, 'bandpass', 3000, 0.25, 6);
  }
  whir(on: boolean) {
    this.tone(on ? 120 : 400, 0.6, 'sawtooth', 0.06, on ? 400 : 120);
  }
  zap() {
    if (!this.ctx) return;
    this.tone(90, 0.5, 'sawtooth', 0.12, 900);
    this.noise(this.ctx.currentTime, 0.25, this.sfxBus, 'highpass', 5000, 0.12);
  }
  creak() {
    this.tone(140, 0.4, 'sawtooth', 0.07, 110);
    this.tone(210, 0.3, 'square', 0.03, 180, 0.1);
  }
  whoosh() {
    if (!this.ctx) return;
    const r = this.noise(this.ctx.currentTime, 0.5, this.sfxBus, 'bandpass', 400, 0.3, 1);
    r.f.frequency.exponentialRampToValueAtTime(2500, this.ctx.currentTime + 0.45);
  }
  firework() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(400, 0.6, 'sine', 0.05, 1600);
    this.noise(t + 0.6, 0.7, this.sfxBus, 'lowpass', 2000, 0.4);
    this.noise(t + 0.65, 1.0, this.sfxBus, 'highpass', 6000, 0.08);
  }
  engine(dur = 3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const lf = ctx.createOscillator();
    lf.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 10;
    lf.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = ctx.createGain();
    o.connect(f).connect(g).connect(this.sfxBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.5);
    g.gain.setValueAtTime(0.18, t + dur - 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    lf.start(t);
    o.stop(t + dur + 0.1);
    lf.stop(t + dur + 0.1);
  }
  /** Talking "babble" blip with a per-character pitch. */
  voice(pitch: number) {
    if (!this.ctx) return;
    const f = pitch * (0.85 + Math.random() * 0.35);
    this.tone(f, 0.06, 'square', 0.035, f * (0.9 + Math.random() * 0.25));
    this.tone(f * 2, 0.05, 'sine', 0.03);
  }
  fanfare() {
    const notes = [62, 66, 69, 74, 69, 74, 78];
    notes.forEach((n, i) => this.tone(midi(n), i === notes.length - 1 ? 1.2 : 0.18, 'sawtooth', 0.06, undefined, i * 0.13));
    notes.forEach((n, i) => this.tone(midi(n + 12), i === notes.length - 1 ? 1.2 : 0.18, 'triangle', 0.08, undefined, i * 0.13));
  }
  lampOn() {
    this.tone(110, 1.8, 'sawtooth', 0.08, 880);
    this.tone(220, 1.8, 'sine', 0.12, 1760);
    [1319, 1568, 2093].forEach((f, i) => this.tone(f, 1.2, 'sine', 0.07, undefined, 1.4 + i * 0.12));
  }
}
