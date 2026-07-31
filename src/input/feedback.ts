/**
 * Ticks de respuesta al afinar la punteria.
 *
 * Es lo que convierte un arrastre en un dial fisico, y en movil pesa mas que
 * cualquier particula. Un escalon cruzado = un tick.
 *
 * DISENO: los canales son REDUNDANTES, no excluyentes. Detectar que
 * `navigator.vibrate` existe no significa que el aparato vibre: existe en
 * Chrome de escritorio y en Android con la vibracion desactivada en ajustes, y
 * en ambos casos devuelve `true` sin hacer nada. No hay forma fiable de
 * consultar la capacidad real, asi que se disparan todos los canales
 * disponibles y siempre queda al menos uno vivo.
 *
 * - Vibracion: Android. En iOS/Safari la Vibration API sencillamente no existe.
 * - Interruptor haptico: unico camino a lo tactil en iOS 17.4+ desde web, via
 *   un `<input type="checkbox" switch>` oculto. Es un truco de la plataforma,
 *   no una API: puede dejar de funcionar en cualquier version.
 * - Clic de audio: funciona en todas partes, pero se lo come el modo silencio.
 * - Destello visual: el unico que no depende de hardware ni de ajustes. Lo
 *   pinta el canvas a partir de `lastTick`.
 */

import { audioContext, audioRunning, unlockAudio } from '../audio/sfx';

const VIBRATE_MS = 6;

export interface FeedbackChannels {
  vibrate: boolean;
  iosSwitch: boolean;
  audio: boolean;
}

const hasVibrateApi = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** iPadOS se declara como Mac, de ahi la comprobacion de puntos de contacto. */
const isAppleTouch = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

export class Feedback {
  private hapticSwitch: HTMLInputElement | null = null;
  private lastAngleStep = Number.NaN;
  private lastPowerStep = Number.NaN;
  private muted = false;

  /** Momento del ultimo tick en segundos. El render lo usa para el destello. */
  lastTick = Number.NEGATIVE_INFINITY;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Prepara los canales que exigen un gesto del usuario. Idempotente. */
  unlock(): void {
    // El contexto es el mismo que usan los efectos: los navegadores limitan
    // cuantos se pueden abrir.
    unlockAudio();
    this.ensureSwitch();
  }

  private ensureSwitch(): void {
    if (this.hapticSwitch || !isAppleTouch() || typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'checkbox';
    // El atributo `switch` es lo que dispara el haptico en iOS 17.4+.
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    // Fuera de pantalla en vez de display:none: oculto del todo no vibra.
    input.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(input);
    this.hapticSwitch = input;
  }

  channels(): FeedbackChannels {
    return {
      vibrate: hasVibrateApi(),
      iosSwitch: this.hapticSwitch !== null,
      audio: audioRunning(),
    };
  }

  /**
   * Emite un tick si la punteria ha cruzado un escalon.
   * @param fine en modo fino el escalon es de 1; en grueso, de 5
   */
  aimTick(angle: number, power: number, fine: boolean): void {
    const size = fine ? 1 : 5;
    const angleStep = Math.round(angle / size);
    const powerStep = Math.round(power / size);

    const first = Number.isNaN(this.lastAngleStep);
    const changed = angleStep !== this.lastAngleStep || powerStep !== this.lastPowerStep;
    this.lastAngleStep = angleStep;
    this.lastPowerStep = powerStep;

    if (!first && changed) this.pulse();
  }

  /** Olvida el ultimo escalon: el siguiente arrastre no arranca con un tick suelto. */
  resetTicks(): void {
    this.lastAngleStep = Number.NaN;
    this.lastPowerStep = Number.NaN;
  }

  pulse(): void {
    // El destello visual no se silencia nunca: es el suelo de la respuesta.
    this.lastTick = performance.now() / 1000;
    if (this.muted) return;

    if (hasVibrateApi()) navigator.vibrate(VIBRATE_MS);
    if (this.hapticSwitch) this.hapticSwitch.click();
    this.click();
  }

  private click(): void {
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 2100;
    // Ataque y caida muy cortos: debe leerse como un clic, no como un pitido.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }
}
