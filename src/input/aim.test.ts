import { describe, expect, it, vi } from 'vitest';
import { ANGLE_MAX, ANGLE_MIN, type Aim } from '../core/match';
import {
  AimController,
  FINE_GAIN,
  POWER_AT_COARSE,
  PULL_COARSE,
  PULL_MIN,
  aimFromDrag,
  angleFromPull,
  powerFromPull,
  pullForPower,
  type DragInfo,
} from './aim';

const drag = (dx: number, dy: number): DragInfo => ({
  active: true,
  anchorX: 200,
  anchorY: 600,
  curX: 200 - dx,
  curY: 600 - dy,
  length: Math.hypot(dx, dy),
  fine: Math.hypot(dx, dy) > PULL_COARSE,
});

describe('powerFromPull', () => {
  it('empieza en cero y crece', () => {
    expect(powerFromPull(0)).toBe(0);
    expect(powerFromPull(70)).toBeGreaterThan(0);
    expect(powerFromPull(140)).toBeGreaterThan(powerFromPull(70));
  });

  it('el tramo grueso termina en la potencia prevista', () => {
    expect(powerFromPull(PULL_COARSE)).toBeCloseTo(POWER_AT_COARSE, 6);
  });

  it('el modo fino reduce la ganancia en la proporcion configurada', () => {
    const grueso = powerFromPull(100) - powerFromPull(80);
    const fino = powerFromPull(PULL_COARSE + 40) - powerFromPull(PULL_COARSE + 20);
    expect(fino).toBeCloseTo(grueso * FINE_GAIN, 6);
  });

  it('nunca pasa de 100 por mucho que estires', () => {
    expect(powerFromPull(5000)).toBe(100);
  });

  it('la potencia maxima cabe en el sitio que hay de verdad', () => {
    // El gesto arranca en la linea de suelo o mas abajo, asi que hacia el borde
    // inferior quedan unos 180px. Un recorrido mayor deja el 100 inalcanzable
    // salvo empezando pegado al borde o tirando en diagonal, lo que ademas te
    // cambia el angulo. Paso jugando con el techo anterior de 239px.
    expect(pullForPower(100)).toBeLessThan(160);
  });

  it('el tramo fino sigue siendo mucho mas preciso que el grueso', () => {
    // Acortar el recorrido no puede cargarse la razon de ser del modo fino.
    const grueso = powerFromPull(60) - powerFromPull(40);
    const fino = powerFromPull(PULL_COARSE + 40) - powerFromPull(PULL_COARSE + 20);
    expect(grueso / fino).toBeGreaterThan(3);
  });

  it('pullForPower es la inversa de powerFromPull', () => {
    for (const p of [0, 20, 50, 85, 92, 100]) {
      expect(powerFromPull(pullForPower(p))).toBeCloseTo(p, 6);
    }
  });
});

describe('angleFromPull', () => {
  it('tirar hacia abajo y atras lanza hacia arriba y adelante', () => {
    // Gorila mirando a la derecha: se tensa hacia abajo-izquierda.
    expect(angleFromPull(100, -100, 1)).toBeCloseTo(45, 6);
    expect(angleFromPull(0, -100, 1)).toBeCloseTo(90, 6);
  });

  it('el angulo es espejo para el gorila que mira a la izquierda', () => {
    // Mismo gesto relativo a su rival = mismo angulo en su propio marco.
    expect(angleFromPull(-100, -100, -1)).toBeCloseTo(45, 6);
    expect(angleFromPull(0, -100, -1)).toBeCloseTo(90, 6);
  });

  it('se recorta al rango jugable', () => {
    expect(angleFromPull(100, 100, 1)).toBe(ANGLE_MIN);
    expect(angleFromPull(-10, -100, 1)).toBeLessThanOrEqual(ANGLE_MAX);
    expect(angleFromPull(-100, -10, 1)).toBe(ANGLE_MAX);
  });

  it('un tiron mas largo da el mismo angulo', () => {
    // La direccion no depende de la distancia: estirar solo sube la potencia y
    // estabiliza el pulso.
    expect(angleFromPull(300, -300, 1)).toBeCloseTo(angleFromPull(30, -30, 1), 6);
  });
});

describe('aimFromDrag', () => {
  it('combina angulo y potencia del mismo gesto', () => {
    const aim = aimFromDrag(drag(99, -99), 1);
    expect(aim.angle).toBeCloseTo(45, 4);
    expect(aim.power).toBeCloseTo(powerFromPull(Math.hypot(99, 99)), 6);
  });

  it('un gesto nulo no mueve la potencia', () => {
    expect(aimFromDrag(drag(0, 0), 1).power).toBe(0);
  });
});

/**
 * Elemento minimo para ejercitar el controlador sin cargar un DOM entero.
 * `setPointerCapture` falla a proposito: comprueba de paso que la captura es
 * una mejora y no un requisito del gesto.
 */
class FakeElement {
  private readonly handlers = new Map<string, Array<(e: PointerEvent) => void>>();

  addEventListener(type: string, handler: (e: PointerEvent) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  removeEventListener(type: string, handler: (e: PointerEvent) => void): void {
    this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== handler));
  }

  setPointerCapture(): never {
    throw new Error('captura no disponible');
  }

  hasPointerCapture(): boolean {
    return false;
  }

  releasePointerCapture(): void {}

  emit(type: string, pointerId: number, x: number, y: number): void {
    const event = { pointerId, clientX: x, clientY: y, preventDefault: () => {} };
    for (const h of this.handlers.get(type) ?? []) h(event as unknown as PointerEvent);
  }
}

/** Suelo ficticio: solo se puede tensar de aqui hacia abajo. */
const SUELO = 560;

function montar(enabled = true) {
  const element = new FakeElement();
  const onFire = vi.fn<(aim: Aim) => void>();
  const onCancel = vi.fn<() => void>();
  const onAim = vi.fn<(aim: Aim, drag: DragInfo) => void>();
  const controller = new AimController(element as unknown as HTMLElement, {
    enabled: () => enabled,
    canStartAt: (_x, y) => y >= SUELO,
    facing: () => 1,
    onAim,
    onFire,
    onCancel,
  });
  return { element, controller, onFire, onCancel, onAim };
}

describe('AimController', () => {
  it('soltar tras tensar lanza', () => {
    const { element, onFire } = montar();
    element.emit('pointerdown', 1, 300, 600);
    element.emit('pointermove', 1, 240, 660);
    element.emit('pointerup', 1, 240, 660);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0]![0].angle).toBeCloseTo(45, 4);
  });

  it('un roce sin tension cancela en vez de gastar el turno', () => {
    const { element, onFire, onCancel } = montar();
    element.emit('pointerdown', 1, 300, 600);
    element.emit('pointermove', 1, 300 - PULL_MIN + 4, 600);
    element.emit('pointerup', 1, 300 - PULL_MIN + 4, 600);
    expect(onFire).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('un segundo dedo cancela el tiro que estabas montando', () => {
    const { element, onFire, onCancel } = montar();
    element.emit('pointerdown', 1, 300, 600);
    element.emit('pointermove', 1, 200, 700);
    element.emit('pointerdown', 2, 100, 500);

    expect(onCancel).toHaveBeenCalledTimes(1);
    // Y al levantar el primer dedo tampoco sale el platano.
    element.emit('pointerup', 1, 200, 700);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('tras cancelar se puede volver a tensar desde otro sitio', () => {
    const { element, onFire } = montar();
    element.emit('pointerdown', 1, 300, 600);
    element.emit('pointermove', 1, 200, 700);
    element.emit('pointerdown', 2, 100, 500);
    element.emit('pointerup', 1, 200, 700);
    element.emit('pointerup', 2, 100, 500);

    element.emit('pointerdown', 3, 120, 620);
    element.emit('pointermove', 3, 60, 680);
    element.emit('pointerup', 3, 60, 680);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('el segundo dedo no arranca un arrastre nuevo por su cuenta', () => {
    const { element, onAim } = montar();
    element.emit('pointerdown', 1, 300, 600);
    element.emit('pointermove', 1, 200, 700);
    const antes = onAim.mock.calls.length;
    element.emit('pointerdown', 2, 100, 500);
    element.emit('pointermove', 2, 50, 550);
    expect(onAim.mock.calls.length).toBe(antes);
  });

  it('no se puede tensar desde el medio de la pantalla', () => {
    // Tensar desde arriba pondria la mano encima de la ciudad y de la
    // trayectoria justo mientras apuntas.
    const { element, onFire, onAim } = montar();
    element.emit('pointerdown', 1, 300, SUELO - 120);
    element.emit('pointermove', 1, 240, SUELO - 60);
    element.emit('pointerup', 1, 240, SUELO - 60);
    expect(onAim).not.toHaveBeenCalled();
    expect(onFire).not.toHaveBeenCalled();
  });

  it('el arrastre si puede salirse de la zona una vez empezado', () => {
    // La restriccion es sobre donde EMPIEZA el gesto, no sobre por donde pasa:
    // tensar hacia arriba es legitimo.
    const { element, onFire } = montar();
    element.emit('pointerdown', 1, 300, SUELO + 10);
    element.emit('pointermove', 1, 240, SUELO - 80);
    element.emit('pointerup', 1, 240, SUELO - 80);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('no responde cuando no toca apuntar', () => {
    const { element, onFire } = montar(false);
    element.emit('pointerdown', 1, 300, 600);
    element.emit('pointermove', 1, 200, 700);
    element.emit('pointerup', 1, 200, 700);
    expect(onFire).not.toHaveBeenCalled();
  });
});
