import { describe, expect, it } from 'vitest';
import { HIT_H, HIT_W } from '../core/match';
import {
  DUCK_DURATION,
  GESTURE,
  duckPose,
  gestureArms,
  gorillaSilhouette,
  type GestureKind,
} from './scene';

const muestrear = (kind: GestureKind, n = 200) =>
  Array.from({ length: n + 1 }, (_, i) =>
    gestureArms({ kind, t: (i / n) * GESTURE[kind].duration }),
  );

describe('gestureArms', () => {
  it('sin gesto los brazos estan quietos', () => {
    expect(gestureArms(null)).toEqual({ left: 0, right: 0, envelope: 0 });
  });

  it('arranca y termina en reposo', () => {
    // Sin esto los brazos apareceran ya levantados de golpe al empezar.
    for (const kind of ['hoot', 'chest'] as const) {
      for (const t of [0, GESTURE[kind].duration]) {
        const arms = gestureArms({ kind, t });
        expect(arms.left).toBeCloseTo(0, 6);
        expect(arms.right).toBeCloseTo(0, 6);
      }
    }
  });

  it('los brazos van alternos, nunca a la vez', () => {
    // Es el rasgo de los dos gestos: cuando uno sube el otro baja.
    for (const kind of ['hoot', 'chest'] as const) {
      const opuestos = muestrear(kind).filter(
        (a) => a.envelope >= 0.3 && Math.abs(a.left - a.right) > 0.3,
      ).length;
      expect(opuestos).toBeGreaterThan(30);
    }
  });

  it('la suma de ambos brazos sigue la envolvente', () => {
    // Consecuencia directa del desfase de medio ciclo.
    for (const arms of muestrear('hoot', 60)) {
      expect(arms.left + arms.right).toBeCloseTo(arms.envelope, 6);
    }
  });

  it('nunca se sale del rango util', () => {
    for (const kind of ['hoot', 'chest'] as const) {
      for (const arms of muestrear(kind, 400)) {
        for (const v of [arms.left, arms.right, arms.envelope]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1.0001);
        }
      }
    }
  });

  it('cada gesto hace el numero de bombeos previsto', () => {
    for (const kind of ['hoot', 'chest'] as const) {
      const serie = muestrear(kind, 800).map((a) => a.left);
      let picos = 0;
      for (let i = 1; i < serie.length - 1; i++) {
        if (serie[i]! > serie[i - 1]! && serie[i]! >= serie[i + 1]!) picos++;
      }
      expect(picos).toBe(GESTURE[kind].pumps);
    }
  });

  it('el golpe de pecho cruza los brazos hacia dentro y el grito los sube', () => {
    // El signo del barrido es lo unico que separa un gesto del otro.
    expect(GESTURE.chest.sweep).toBeLessThan(0);
    expect(GESTURE.hoot.sweep).toBeGreaterThan(0);
  });
});

describe('duckPose', () => {
  it('de pie cuando no hay nada que esquivar', () => {
    expect(duckPose(null)).toBe(0);
    expect(duckPose(-1)).toBe(0);
    expect(duckPose(DUCK_DURATION + 1)).toBe(0);
  });

  it('baja de golpe y se incorpora despacio', () => {
    // Agacharse es un reflejo; levantarse es mirar si ha pasado el peligro.
    const bajada = 0.09;
    expect(duckPose(bajada)).toBeCloseTo(1, 6);
    const subida = DUCK_DURATION - 0.68;
    expect(subida).toBeGreaterThan(bajada * 2);
  });

  it('se mantiene agachado durante el paso del platano', () => {
    expect(duckPose(0.3)).toBe(1);
    expect(duckPose(0.6)).toBe(1);
  });

  it('vuelve a cero al final sin saltos', () => {
    expect(duckPose(DUCK_DURATION - 0.001)).toBeLessThan(0.02);
  });

  it('nunca se sale de 0..1', () => {
    for (let i = 0; i <= 300; i++) {
      const v = duckPose((i / 300) * DUCK_DURATION * 1.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('la caja de golpeo cubre al gorila dibujado', () => {
  it('un platano que roza la cabeza tiene que impactar', () => {
    // El fallo original: la caja acababa a 6u y la cabeza llegaba a 8,4, asi
    // que el platano la atravesaba sin colisionar. Este test ata la caja al
    // dibujo para que un cambio de arte no vuelva a desincronizarlos.
    const silueta = gorillaSilhouette();
    expect(HIT_H).toBeGreaterThanOrEqual(silueta.height - 0.3);
    expect(HIT_W / 2).toBeGreaterThanOrEqual(silueta.halfWidth - 0.3);
  });

  it('pero la caja no se infla mas alla de la silueta', () => {
    // Acertar a un gorila invisible seria igual de injusto que fallar a uno
    // que se ve.
    const silueta = gorillaSilhouette();
    expect(HIT_H).toBeLessThanOrEqual(silueta.height + 0.5);
    expect(HIT_W / 2).toBeLessThanOrEqual(silueta.halfWidth + 0.5);
  });
});
