/**
 * Sonido sintetizado con WebAudio. Cero ficheros de audio: el bundle no crece,
 * no hay que esperar descargas y cada efecto se puede afinar con un numero.
 *
 * El AudioContext es compartido con los ticks de punteria: los navegadores
 * limitan cuantos se pueden abrir, y uno solo basta.
 */

let shared: AudioContext | null = null;

/** Crea o reanuda el contexto. Debe llamarse dentro de un gesto del usuario. */
export function unlockAudio(): AudioContext | null {
  if (!shared) {
    type WithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ?? (globalThis as WithWebkit).webkitAudioContext);
    if (!Ctor) return null;
    shared = new Ctor();
  }
  // Safari lo entrega suspendido aunque se cree dentro del gesto.
  if (shared.state === 'suspended') void shared.resume();
  return shared;
}

export function audioContext(): AudioContext | null {
  return shared;
}

export function audioRunning(): boolean {
  return shared !== null && shared.state === 'running';
}

/** Ruido blanco de un segundo, reutilizado por todos los golpes. */
let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

export class Sfx {
  private master: GainNode | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.45;
  }

  private out(): { ctx: AudioContext; master: GainNode } | null {
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running' || this.muted) return null;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(ctx.destination);
    }
    return { ctx, master: this.master };
  }

  /** Silbido del lanzamiento. Cuanto mas fuerte el tiro, mas agudo y largo. */
  whoosh(power: number): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;
    const now = ctx.currentTime;
    const strength = Math.max(0, Math.min(1, power / 100));

    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(400 + strength * 900, now);
    band.frequency.exponentialRampToValueAtTime(220, now + 0.28);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1 + strength * 0.16, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    src.connect(band).connect(gain).connect(master);
    src.start(now);
    src.stop(now + 0.32);
  }

  /** Estallido: cuerpo grave de ruido filtrado mas un golpe sub. */
  explosion(big = true): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;
    const now = ctx.currentTime;
    const dur = big ? 0.55 : 0.22;

    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(big ? 1800 : 900, now);
    low.frequency.exponentialRampToValueAtTime(120, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(big ? 0.55 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(low).connect(gain).connect(master);
    src.start(now);
    src.stop(now + dur);

    // El sub es lo que hace que se sienta en el pecho y no solo en el oido.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(big ? 90 : 130, now);
    sub.frequency.exponentialRampToValueAtTime(big ? 32 : 60, now + dur * 0.8);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(big ? 0.5 : 0.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.9);
    sub.connect(subGain).connect(master);
    sub.start(now);
    sub.stop(now + dur);
  }

  /** Un "uh" de gorila. Se encadenan tres para el gesto de brazos. */
  hoot(delay = 0): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;
    const now = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    // Curva de tono de la voz: sube rapido y cae. Sin esto suena a pitido.
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.05);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.19);

    // Formante: un pasa-bajo resonante convierte el diente de sierra en vocal.
    const formant = ctx.createBiquadFilter();
    formant.type = 'lowpass';
    formant.frequency.value = 760;
    formant.Q.value = 7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(formant).connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /**
   * "Uh uh uh". Cada grito cae en el punto alto del brazo, no al empezar el
   * ciclo: de ahi el desfase inicial.
   */
  taunt(spacing: number, offset = 0): void {
    for (let i = 0; i < 3; i++) this.hoot(offset + i * spacing);
  }

  /**
   * Agacharse a tiempo: un "wup" corto con caida de tono. Corto a proposito,
   * porque va justo antes de que el platano pase silbando.
   */
  duck(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(170, now + 0.13);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.26, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /** Risa: cuatro sonidos cortos y descendentes. */
  laugh(delay = 0): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;

    [330, 296, 268, 244].forEach((freq, i) => {
      const at = ctx.currentTime + delay + i * 0.115;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, at + 0.08);

      // Mismo formante que el "uh": lo que suena tiene que ser el mismo bicho.
      const formant = ctx.createBiquadFilter();
      formant.type = 'lowpass';
      formant.frequency.value = 900;
      formant.Q.value = 6;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.24, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.095);

      osc.connect(formant).connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.11);
    });
  }

  /** Golpes de pecho: cuatro impactos huecos y graves. */
  chestBeat(spacing: number, offset = 0): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;

    for (let i = 0; i < 4; i++) {
      const at = ctx.currentTime + offset + i * spacing;

      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 260;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, at);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      src.connect(low).connect(noiseGain).connect(master);
      src.start(at);
      src.stop(at + 0.13);

      // El cuerpo grave es lo que lo convierte en un pecho y no en un golpe
      // cualquiera: caja de resonancia.
      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(128, at);
      body.frequency.exponentialRampToValueAtTime(62, at + 0.1);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.34, at);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      body.connect(bodyGain).connect(master);
      body.start(at);
      body.stop(at + 0.15);
    }
  }

  /** Choque contra edificio sin victima. */
  thud(): void {
    this.explosion(false);
  }

  /** Fanfarria corta al acertar. */
  cheer(): void {
    const o = this.out();
    if (!o) return;
    const { ctx, master } = o;
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const at = now + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + 0.2);
    });
  }
}
