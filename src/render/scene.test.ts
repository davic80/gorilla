import { describe, expect, it } from 'vitest';
import { TAUNT_DURATION, TAUNT_PUMPS, tauntArms } from './scene';

const muestrear = (n = 200) =>
  Array.from({ length: n + 1 }, (_, i) => tauntArms((i / n) * TAUNT_DURATION));

describe('tauntArms', () => {
  it('sin gesto los brazos estan quietos', () => {
    expect(tauntArms(null)).toEqual({ left: 0, right: 0, envelope: 0 });
  });

  it('arranca y termina en reposo', () => {
    // Sin esto los brazos apareceran ya levantados de golpe al empezar.
    for (const t of [0, TAUNT_DURATION]) {
      const arms = tauntArms(t);
      expect(arms.left).toBeCloseTo(0, 6);
      expect(arms.right).toBeCloseTo(0, 6);
    }
  });

  it('los brazos van alternos, nunca a la vez', () => {
    // Es el rasgo del gesto: cuando uno sube el otro baja.
    let opuestos = 0;
    for (const arms of muestrear()) {
      if (arms.envelope < 0.3) continue;
      if (Math.abs(arms.left - arms.right) > 0.3) opuestos++;
    }
    expect(opuestos).toBeGreaterThan(40);
  });

  it('la suma de ambos brazos sigue la envolvente', () => {
    // Consecuencia directa del desfase de medio ciclo: lo que sube uno lo baja
    // el otro, asi que el total no depende de la fase.
    for (const arms of muestrear(60)) {
      expect(arms.left + arms.right).toBeCloseTo(arms.envelope, 6);
    }
  });

  it('nunca se sale del rango util', () => {
    for (const arms of muestrear(400)) {
      for (const v of [arms.left, arms.right, arms.envelope]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('hace el numero de bombeos previsto', () => {
    // Un maximo local de cada brazo por ciclo: tres arriba y tres abajo.
    const serie = muestrear(600).map((a) => a.left);
    let picos = 0;
    for (let i = 1; i < serie.length - 1; i++) {
      if (serie[i]! > serie[i - 1]! && serie[i]! >= serie[i + 1]!) picos++;
    }
    expect(picos).toBe(TAUNT_PUMPS);
  });

  it('recorta si el reloj se pasa de la duracion', () => {
    const arms = tauntArms(TAUNT_DURATION * 2);
    expect(arms.left).toBeCloseTo(0, 6);
    expect(arms.right).toBeCloseTo(0, 6);
  });
});
