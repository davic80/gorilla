/**
 * Reloj de paso fijo con acumulador.
 *
 * La simulacion SIEMPRE avanza en pasos de `FIXED_STEP` exactos, nunca con el
 * delta variable del frame. Sin esto no hay determinismo, y sin determinismo no
 * hay repeticiones, ni IA que reuse el simulador, ni retos por URL.
 *
 * La clase no toca `requestAnimationFrame` a proposito: asi es testeable sin
 * navegador.
 */

export const FIXED_STEP = 1 / 240;

/** Techo de pasos por frame: evita la espiral de la muerte si el hilo se atasca. */
export const MAX_STEPS_PER_FRAME = 60;

/** Delta maximo aceptado (pestana en segundo plano devuelve saltos enormes). */
export const MAX_FRAME_DELTA = 0.25;

export interface Tick {
  /** Pasos fijos a ejecutar en este frame. */
  steps: number;
  /** Fraccion sobrante en [0,1) para interpolar el render. */
  alpha: number;
  /**
   * true si se descarto tiempo real, ya sea por recortar un delta enorme o por
   * saturar el techo de pasos. La simulacion sigue siendo determinista: lo que
   * se pierde es tiempo de pared, no precision.
   */
  dropped: boolean;
}

export class FixedStepClock {
  private acc = 0;

  constructor(
    readonly step: number = FIXED_STEP,
    readonly maxSteps: number = MAX_STEPS_PER_FRAME,
    readonly maxDelta: number = MAX_FRAME_DELTA,
  ) {}

  /** Consume el tiempo real transcurrido y devuelve cuantos pasos ejecutar. */
  tick(deltaSeconds: number): Tick {
    // Una lectura absurda (NaN, Infinity, negativa) se trata como frame nulo:
    // mas seguro que interpretarla como un salto gigante de tiempo.
    let dt = deltaSeconds;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;

    let dropped = false;
    if (dt > this.maxDelta) {
      dt = this.maxDelta;
      dropped = true;
    }

    this.acc += dt;

    let steps = Math.floor(this.acc / this.step);
    if (steps > this.maxSteps) {
      // Nos hemos quedado atras sin remedio: soltamos el tiempo pendiente en
      // lugar de intentar recuperarlo, que solo empeoraria el atasco.
      steps = this.maxSteps;
      this.acc = 0;
      dropped = true;
    } else {
      this.acc -= steps * this.step;
    }

    return { steps, alpha: this.acc / this.step, dropped };
  }

  reset(): void {
    this.acc = 0;
  }
}
