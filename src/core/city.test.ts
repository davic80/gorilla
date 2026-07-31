import { describe, expect, it } from 'vitest';
import { SLOPE_KINDS, generateCity, rooftop } from './city';
import { CITY, WORLD_WIDTH } from './constants';
import { Rng } from './rng';

const SEMILLAS = Array.from({ length: 500 }, (_, i) => i * 7919 + 13);

describe('generateCity', () => {
  it('la misma semilla produce exactamente la misma ciudad', () => {
    for (const seed of [0, 1, 42, 999999, 0xffffffff]) {
      const a = generateCity(new Rng(seed));
      const b = generateCity(new Rng(seed));
      expect(a).toEqual(b);
    }
  });

  it('semillas distintas producen ciudades distintas', () => {
    const vistas = new Set(
      SEMILLAS.slice(0, 100).map((s) => JSON.stringify(generateCity(new Rng(s)).buildings)),
    );
    expect(vistas.size).toBe(100);
  });

  it('los edificios cubren el mundo sin huecos ni solapes', () => {
    for (const seed of SEMILLAS) {
      const { buildings } = generateCity(new Rng(seed));
      let x = 0;
      for (const b of buildings) {
        expect(b.x).toBeCloseTo(x, 9);
        expect(b.width).toBeGreaterThan(0);
        x += b.width;
      }
      expect(x).toBeCloseTo(WORLD_WIDTH, 9);
    }
  });

  it('las alturas respetan los limites configurados', () => {
    for (const seed of SEMILLAS) {
      for (const b of generateCity(new Rng(seed)).buildings) {
        expect(b.height).toBeGreaterThanOrEqual(CITY.minHeight);
        expect(b.height).toBeLessThanOrEqual(CITY.maxHeight);
      }
    }
  });

  it('el numero de edificios se mantiene en rango', () => {
    for (const seed of SEMILLAS) {
      const n = generateCity(new Rng(seed)).buildings.length;
      expect(n).toBeGreaterThanOrEqual(CITY.minBuildings);
      expect(n).toBeLessThanOrEqual(CITY.maxBuildings);
    }
  });

  it('los gorilas caen en edificios validos y distintos', () => {
    for (const seed of SEMILLAS) {
      const city = generateCity(new Rng(seed));
      expect(city.homeA).toBeGreaterThanOrEqual(0);
      expect(city.homeB).toBeLessThan(city.buildings.length);
      expect(city.homeA).not.toBe(city.homeB);
      // En los extremos: maxima distancia entre gorilas.
      expect(city.homeA).toBe(0);
      expect(city.homeB).toBe(city.buildings.length - 1);
    }
  });

  it('genera los cuatro patrones de pendiente', () => {
    const vistos = new Set(SEMILLAS.map((s) => generateCity(new Rng(s)).slope));
    expect([...vistos].sort()).toEqual([...SLOPE_KINDS].sort());
  });

  it('los anchos normalizados no degeneran en tiras', () => {
    for (const seed of SEMILLAS) {
      for (const b of generateCity(new Rng(seed)).buildings) {
        // Tras normalizar, ningun edificio debe quedar mas estrecho que el
        // gorila que tiene que sostener.
        expect(b.width).toBeGreaterThan(7);
      }
    }
  });
});

describe('rooftop', () => {
  it('devuelve el centro del tejado cuando hay sitio', () => {
    const city = generateCity(new Rng(1234));
    const b = city.buildings[3]!;
    const spot = rooftop(city, 3);
    expect(spot.x).toBeCloseTo(b.x + b.width / 2, 9);
    expect(spot.y).toBeCloseTo(b.height, 9);
  });

  it('se separa del borde sin bajarse de su propio edificio', () => {
    // Los gorilas viven en los extremos: si el centro del edificio cae pegado
    // al borde, al levantar los brazos se saldrian de la pantalla.
    for (const seed of SEMILLAS) {
      const city = generateCity(new Rng(seed));
      for (const index of [city.homeA, city.homeB]) {
        const b = city.buildings[index]!;
        const spot = rooftop(city, index);
        expect(spot.x).toBeGreaterThanOrEqual(5);
        expect(spot.x).toBeLessThanOrEqual(WORLD_WIDTH - 5);
        // Y sigue estando sobre su tejado, no en el aire.
        expect(spot.x).toBeGreaterThanOrEqual(b.x);
        expect(spot.x).toBeLessThanOrEqual(b.x + b.width);
      }
    }
  });

  it('falla ante un indice inexistente', () => {
    const city = generateCity(new Rng(1));
    expect(() => rooftop(city, 999)).toThrow();
  });
});
