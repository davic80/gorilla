import { describe, expect, it } from 'vitest';
import { FIXED_STEP, FixedStepClock, MAX_STEPS_PER_FRAME } from './loop';

describe('FixedStepClock', () => {
  it('no ejecuta pasos hasta acumular uno completo', () => {
    const clock = new FixedStepClock();
    expect(clock.tick(FIXED_STEP * 0.4).steps).toBe(0);
    expect(clock.tick(FIXED_STEP * 0.4).steps).toBe(0);
    expect(clock.tick(FIXED_STEP * 0.4).steps).toBe(1);
  });

  it('no pierde tiempo entre frames', () => {
    const clock = new FixedStepClock();
    let total = 0;
    // 100 frames a 60 fps deben dar exactamente los pasos de 100/60 segundos.
    for (let i = 0; i < 100; i++) total += clock.tick(1 / 60).steps;
    const esperados = Math.floor(100 / 60 / FIXED_STEP);
    expect(Math.abs(total - esperados)).toBeLessThanOrEqual(1);
  });

  it('alpha se queda en [0, 1)', () => {
    const clock = new FixedStepClock();
    for (let i = 0; i < 500; i++) {
      const { alpha } = clock.tick(0.0071);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('recorta saltos enormes (pestana en segundo plano)', () => {
    const clock = new FixedStepClock();
    const { steps, dropped } = clock.tick(30);
    expect(dropped).toBe(true);
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('no entra en espiral de la muerte', () => {
    const clock = new FixedStepClock();
    // Frames sostenidos muy por encima del presupuesto: los pasos por frame
    // nunca deben crecer sin control.
    for (let i = 0; i < 50; i++) {
      expect(clock.tick(1).steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    }
  });

  it('trata deltas negativos o no finitos como frame nulo', () => {
    const clock = new FixedStepClock();
    for (const basura of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const tick = clock.tick(basura);
      expect(tick.steps).toBe(0);
      expect(tick.dropped).toBe(false);
    }
  });

  it('reset vacia el acumulador', () => {
    const clock = new FixedStepClock();
    clock.tick(FIXED_STEP * 0.9);
    clock.reset();
    expect(clock.tick(FIXED_STEP * 0.5).steps).toBe(0);
  });
});
