/**
 * BGM / SE（GDD Ver.3 §8: シナリオデータから呼び出す）。
 * 音声素材がまだ無いため、Web Audio で手続き的に合成する。
 * 素材が用意できたら、ID ごとに音声ファイルを再生する実装へ差し替えられる（呼び出し側は ID のみ）。
 *
 * ブラウザの自動再生制限により、最初の再生はユーザー操作（タップ・クリック）の後に行う。
 */

type BgmId = 'void' | 'rain' | 'akarua' | 'tension' | 'night' | 'archive';
type SeId = 'glitch' | 'sync' | 'door' | 'click' | 'rewrite' | 'hit';

interface Playing {
  id: string;
  stop: (fade: number) => void;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private seGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private current: Playing | null = null;
  private volumes = { bgm: 0.6, se: 0.8 };
  private wantedBgm: string | null = null;

  /** ユーザー操作の中で呼ぶ（AudioContext を作成・再開する） */
  unlock(): void {
    const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.bgmGain = this.ctx.createGain();
      this.seGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
      this.seGain.connect(this.ctx.destination);
      this.applyVolumes();
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedBgm && this.current?.id !== this.wantedBgm) this.playBgm(this.wantedBgm);
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  setVolumes(bgm: number, se: number): void {
    this.volumes = { bgm, se };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.bgmGain || !this.seGain) return;
    this.bgmGain.gain.setTargetAtTime(this.volumes.bgm * 0.35, this.ctx.currentTime, 0.05);
    this.seGain.gain.setTargetAtTime(this.volumes.se * 0.5, this.ctx.currentTime, 0.05);
  }

  playBgm(id: string | null): void {
    this.wantedBgm = id;
    if (!this.ctx || !this.bgmGain) return;
    if (this.current?.id === id) return;
    this.current?.stop(1.2);
    this.current = null;
    if (!id) return;
    const make = BGM[id as BgmId];
    if (make) this.current = { id, stop: make(this.ctx, this.bgmGain, this.noise!) };
  }

  stopBgm(): void {
    this.playBgm(null);
  }

  playSe(id: string): void {
    if (!this.ctx || !this.seGain || this.ctx.state !== 'running') return;
    const make = SE[id as SeId];
    if (make) make(this.ctx, this.seGain, this.noise!);
  }
}

export const audio = new AudioManager();

// ---------------------------------------------------------------- 合成ユーティリティ

function voice(ctx: AudioContext, out: AudioNode, freq: number, type: OscillatorType, gain: number, detune = 0) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.value = gain;
  o.connect(g).connect(out);
  o.start();
  return { o, g };
}

function lfo(ctx: AudioContext, target: AudioParam, rate: number, depth: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = rate;
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  return o;
}

function padStop(ctx: AudioContext, master: GainNode, nodes: { stop: (t?: number) => void }[]) {
  return (fade: number) => {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + fade);
    for (const n of nodes) n.stop(t + fade + 0.05);
  };
}

function bgmBus(ctx: AudioContext, out: AudioNode, cutoff: number) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  master.connect(filter).connect(out);
  return { master, filter };
}

const BGM: Record<BgmId, (ctx: AudioContext, out: AudioNode, noise: AudioBuffer) => (fade: number) => void> = {
  void: (ctx, out) => {
    const { master, filter } = bgmBus(ctx, out, 700);
    const a = voice(ctx, master, 55, 'sine', 0.5);
    const b = voice(ctx, master, 82.4, 'sine', 0.3, 7);
    const c = voice(ctx, master, 164.8, 'triangle', 0.08, -12);
    const l = lfo(ctx, filter.frequency, 0.07, 300);
    return padStop(ctx, master, [a.o, b.o, c.o, l]);
  },
  rain: (ctx, out, noise) => {
    const { master } = bgmBus(ctx, out, 2400);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    src.connect(bp).connect(ng).connect(master);
    src.start();
    const notes = [220, 261.6, 329.6];
    const vs = notes.map((f, i) => voice(ctx, master, f, 'sine', 0.06, i * 3));
    const l = lfo(ctx, vs[0].g.gain, 0.12, 0.04);
    return padStop(ctx, master, [src, ...vs.map((v) => v.o), l]);
  },
  akarua: (ctx, out) => {
    const { master, filter } = bgmBus(ctx, out, 1500);
    const notes = [174.6, 220, 261.6, 349.2];
    const vs = notes.map((f, i) => voice(ctx, master, f, 'triangle', 0.07, i % 2 ? 5 : -5));
    const l1 = lfo(ctx, filter.frequency, 0.1, 400);
    const l2 = lfo(ctx, vs[3].g.gain, 0.25, 0.03);
    return padStop(ctx, master, [...vs.map((v) => v.o), l1, l2]);
  },
  night: (ctx, out, noise) => {
    // 静かな夜: 遠い雨音 + Dm9 のゆっくりした和音
    const { master, filter } = bgmBus(ctx, out, 1100);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.5;
    const ng = ctx.createGain();
    ng.gain.value = 0.08;
    src.connect(bp).connect(ng).connect(master);
    src.start();
    const notes = [146.8, 174.6, 220, 329.6];
    const vs = notes.map((f, i) => voice(ctx, master, f, 'sine', 0.06, i % 2 ? 4 : -4));
    const l1 = lfo(ctx, vs[2].g.gain, 0.08, 0.035);
    const l2 = lfo(ctx, vs[3].g.gain, 0.05, 0.03);
    const l3 = lfo(ctx, filter.frequency, 0.04, 250);
    return padStop(ctx, master, [src, ...vs.map((v) => v.o), l1, l2, l3]);
  },
  archive: (ctx, out) => {
    // 書庫: 高いところで鳴り続ける Cmaj7 と、ゆっくり揺れる低音
    const { master, filter } = bgmBus(ctx, out, 1800);
    const notes = [130.8, 261.6, 329.6, 392, 493.9];
    const vs = notes.map((f, i) => voice(ctx, master, f, i === 0 ? 'sine' : 'triangle', i === 0 ? 0.12 : 0.04, i % 2 ? 6 : -6));
    const l1 = lfo(ctx, vs[4].g.gain, 0.09, 0.03);
    const l2 = lfo(ctx, vs[0].g.gain, 0.05, 0.05);
    const l3 = lfo(ctx, filter.frequency, 0.06, 500);
    return padStop(ctx, master, [...vs.map((v) => v.o), l1, l2, l3]);
  },
  tension: (ctx, out) => {
    const { master, filter } = bgmBus(ctx, out, 500);
    const a = voice(ctx, master, 55, 'square', 0.12);
    const b = voice(ctx, master, 58.3, 'sawtooth', 0.05);
    const c = voice(ctx, master, 440, 'sine', 0.015, 15);
    const l = lfo(ctx, a.g.gain, 2, 0.1);
    const l2 = lfo(ctx, filter.frequency, 0.3, 250);
    return padStop(ctx, master, [a.o, b.o, c.o, l, l2]);
  },
};

function envelope(ctx: AudioContext, out: AudioNode, peak: number, attack: number, release: number) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  g.connect(out);
  return g;
}

const SE: Record<SeId, (ctx: AudioContext, out: AudioNode, noise: AudioBuffer) => void> = {
  glitch: (ctx, out, noise) => {
    for (let i = 0; i < 4; i++) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 300 + Math.random() * 3000;
      bp.Q.value = 4;
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.06;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.005);
      g.gain.linearRampToValueAtTime(0, t + 0.05);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random(), 0.06);
    }
  },
  sync: (ctx, out) => {
    const g = envelope(ctx, out, 0.35, 0.05, 1.1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.7);
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + 1.3);
    const g2 = envelope(ctx, out, 0.12, 0.3, 1.2);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 1760;
    o2.connect(g2);
    o2.start();
    o2.stop(ctx.currentTime + 1.6);
  },
  door: (ctx, out, noise) => {
    const g = envelope(ctx, out, 0.6, 0.005, 0.35);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const ng = envelope(ctx, out, 0.15, 0.002, 0.08);
    src.connect(ng);
    src.start(ctx.currentTime, 0, 0.1);
  },
  click: (ctx, out) => {
    const g = envelope(ctx, out, 0.2, 0.002, 0.05);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1300;
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + 0.07);
  },
  rewrite: (ctx, out, noise) => {
    SE.glitch(ctx, out, noise);
    const g = envelope(ctx, out, 0.4, 0.2, 1.4);
    for (const f of [110, 165, 220, 330]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(200, ctx.currentTime);
      lp.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.8);
      o.connect(lp).connect(g);
      o.start();
      o.stop(ctx.currentTime + 1.7);
    }
  },
  hit: (ctx, out, noise) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = envelope(ctx, out, 0.5, 0.002, 0.12);
    src.connect(lp).connect(g);
    src.start(ctx.currentTime, Math.random(), 0.15);
  },
};
