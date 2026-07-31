import { describe, expect, it } from 'vitest';
import { generateCity } from '../core/city';
import { windForTurn } from '../core/match';
import { Rng } from '../core/rng';
import { buildSky, cloudDriftStep } from './sky';

const ciudad = (seed: number) => generateCity(new Rng(seed));

describe('buildSky', () => {
  it('es determinista: dos moviles con la misma semilla ven el mismo cielo', () => {
    expect(buildSky(ciudad(4242))).toEqual(buildSky(ciudad(4242)));
  });

  it('cada plano se arrastra a su ritmo', () => {
    // Sin paralaje el cielo se mueve como una calcomania y se pierde la
    // sensacion de profundidad.
    const parallax = buildSky(ciudad(7)).clouds.map((c) => c.parallax);
    expect(Math.max(...parallax)).toBeGreaterThan(Math.min(...parallax) * 2);
  });

  it('las fases de luna varian entre partidas', () => {
    const fases = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => buildSky(ciudad(s)).moon.phase);
    expect(new Set(fases).size).toBeGreaterThan(1);
    // Alguna noche sale llena.
    expect(fases.some((f) => f === 0)).toBe(true);
  });
});

describe('cloudDriftStep', () => {
  it('las nubes van hacia donde empuja el viento', () => {
    expect(cloudDriftStep(5, 1)).toBeGreaterThan(0);
    expect(cloudDriftStep(-5, 1)).toBeLessThan(0);
  });

  it('sin viento el cielo se queda quieto', () => {
    expect(cloudDriftStep(0, 1)).toBe(0);
  });

  it('la velocidad es proporcional a la fuerza', () => {
    expect(cloudDriftStep(10, 1)).toBeCloseTo(cloudDriftStep(5, 1) * 2, 9);
  });

  it('es lento incluso con la racha mas fuerte', () => {
    // El fondo da profundidad; no puede competir con la trayectoria.
    expect(Math.abs(cloudDriftStep(20, 1))).toBeLessThan(3);
  });
});

describe('rango de viento', () => {
  const muestra = Array.from({ length: 4000 }, (_, t) => windForTurn(20260731, t));
  const fuerzas = muestra.map(Math.abs);

  const ordenadas = [...fuerzas].sort((a, b) => a - b);
  const percentil = (p: number) => ordenadas[Math.floor(ordenadas.length * p)]!;

  it('el turno corriente tiene viento de verdad, no una brisa', () => {
    // Con la mediana por debajo de 3 el viento deja de importar y el juego se
    // vuelve balistica pura.
    expect(percentil(0.5)).toBeGreaterThan(4);
    expect(percentil(0.5)).toBeLessThan(7);
  });

  it('llega hasta ~20 en las rachas', () => {
    expect(Math.max(...fuerzas)).toBeGreaterThan(17);
    expect(Math.max(...fuerzas)).toBeLessThan(21);
  });

  it('pero las rachas fuertes siguen siendo raras', () => {
    // Son las que hacen memorable un turno, y dejan de serlo si salen cada dos
    // por tres. Uno de cada diez turnos como mucho pasa de 10.
    expect(percentil(0.9)).toBeLessThan(11);
  });

  it('sopla a los dos lados por igual', () => {
    const derecha = muestra.filter((w) => w > 0).length / muestra.length;
    expect(derecha).toBeGreaterThan(0.45);
    expect(derecha).toBeLessThan(0.55);
  });
});
