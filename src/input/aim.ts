/**
 * Conversion de un arrastre en punteria: el gesto "tensa y suelta".
 *
 * Se tira del dedo HACIA ATRAS, como un tirachinas, y el platano sale en la
 * direccion opuesta. La logica esta separada de los eventos de puntero a
 * proposito: asi el mapeo se puede testear sin navegador, que es donde de
 * verdad se decide si el control engancha.
 */

import { ANGLE_MAX, ANGLE_MIN, type Aim } from '../core/match';

/** Por debajo de esto el gesto se considera un toque y se cancela. */
export const PULL_MIN = 14;

/** Radio del tramo grueso, en pixeles CSS. */
export const PULL_COARSE = 140;

/**
 * Potencia alcanzada al final del tramo grueso. No llega a 100 aposta: el
 * ultimo tramo se reserva al modo fino, donde el jugador afina el tiro que se
 * quedo corto en vez de repetirlo a ciegas.
 */
export const POWER_AT_COARSE = 85;

/** Ganancia del modo fino. Es el truco del cursor de iOS. */
export const FINE_GAIN = 0.25;

export interface DragInfo {
  active: boolean;
  anchorX: number;
  anchorY: number;
  curX: number;
  curY: number;
  length: number;
  fine: boolean;
}

export function powerFromPull(length: number): number {
  const coarseGain = POWER_AT_COARSE / PULL_COARSE;
  const raw =
    length <= PULL_COARSE
      ? length * coarseGain
      : POWER_AT_COARSE + (length - PULL_COARSE) * coarseGain * FINE_GAIN;
  return Math.max(0, Math.min(100, raw));
}

/** Distancia de arrastre necesaria para una potencia dada. Inversa de la anterior. */
export function pullForPower(power: number): number {
  const coarseGain = POWER_AT_COARSE / PULL_COARSE;
  if (power <= POWER_AT_COARSE) return power / coarseGain;
  return PULL_COARSE + (power - POWER_AT_COARSE) / (coarseGain * FINE_GAIN);
}

function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * @param dx,dy vector de tension en pixeles de pantalla (ancla menos dedo)
 * @param facing +1 si el gorila mira a la derecha
 * @returns angulo en el marco del jugador: 0 = hacia el rival, 90 = vertical
 */
export function angleFromPull(dx: number, dy: number, facing: 1 | -1): number {
  // El eje Y de pantalla baja y el del mundo sube: de ahi el signo.
  const world = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const own = facing === 1 ? world : 180 - world;
  return Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, normalizeDegrees(own)));
}

export function aimFromDrag(drag: DragInfo, facing: 1 | -1): Aim {
  const dx = drag.anchorX - drag.curX;
  const dy = drag.anchorY - drag.curY;
  return {
    angle: angleFromPull(dx, dy, facing),
    power: powerFromPull(Math.hypot(dx, dy)),
  };
}

export interface AimControllerHooks {
  enabled: () => boolean;
  /**
   * Zona donde se puede empezar a tensar. Restringirla a la franja baja evita
   * dos cosas: que un roce en mitad de la pantalla monte un tiro sin querer, y
   * que la mano tape la ciudad y la trayectoria justo mientras apuntas.
   */
  canStartAt: (x: number, y: number) => boolean;
  facing: () => 1 | -1;
  onAim: (aim: Aim, drag: DragInfo) => void;
  onFire: (aim: Aim) => void;
  onCancel: () => void;
}

/** Traduce eventos de puntero al gesto de tension. */
export class AimController {
  private drag: DragInfo | null = null;
  private pointerId: number | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly hooks: AimControllerHooks,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onAbort);
  }

  get current(): DragInfo | null {
    return this.drag;
  }

  private onDown = (e: PointerEvent): void => {
    // Segundo dedo = cancelar. Si el tiro que estas montando no te convence,
    // lo abortas sin soltar y vuelves a tensar desde donde quieras.
    if (this.pointerId !== null && e.pointerId !== this.pointerId) {
      this.release();
      this.hooks.onCancel();
      e.preventDefault();
      return;
    }

    if (!this.hooks.enabled() || this.pointerId !== null) return;
    if (!this.hooks.canStartAt(e.clientX, e.clientY)) return;

    this.pointerId = e.pointerId;
    // La captura es una mejora, no un requisito: si el navegador la rechaza el
    // gesto debe seguir funcionando.
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura: el arrastre sigue llegando por el propio elemento */
    }
    this.drag = {
      active: true,
      anchorX: e.clientX,
      anchorY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      length: 0,
      fine: false,
    };
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (this.drag === null || e.pointerId !== this.pointerId) return;
    this.drag.curX = e.clientX;
    this.drag.curY = e.clientY;
    this.drag.length = Math.hypot(
      this.drag.anchorX - this.drag.curX,
      this.drag.anchorY - this.drag.curY,
    );
    this.drag.fine = this.drag.length > PULL_COARSE;
    this.hooks.onAim(aimFromDrag(this.drag, this.hooks.facing()), this.drag);
    e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    if (this.drag === null || e.pointerId !== this.pointerId) return;
    const drag = this.drag;
    this.release();

    // Un arrastre minimo es un toque, no un lanzamiento: soltar sin querer no
    // debe gastarte el turno.
    if (drag.length < PULL_MIN) this.hooks.onCancel();
    else this.hooks.onFire(aimFromDrag(drag, this.hooks.facing()));
    e.preventDefault();
  };

  private onAbort = (): void => {
    if (this.drag === null) return;
    this.release();
    this.hooks.onCancel();
  };

  private release(): void {
    try {
      if (this.pointerId !== null && this.element.hasPointerCapture(this.pointerId)) {
        this.element.releasePointerCapture(this.pointerId);
      }
    } catch {
      /* la captura ya no existe: nada que soltar */
    }
    this.drag = null;
    this.pointerId = null;
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onAbort);
  }
}
