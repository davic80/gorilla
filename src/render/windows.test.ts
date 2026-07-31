import { describe, expect, it } from 'vitest';
import { generateCity } from '../core/city';
import { Rng } from '../core/rng';
import { buildWindows, isLit, type CityWindow } from './windows';

const ciudad = (seed: number) => generateCity(new Rng(seed));
const SEMILLAS = [1, 77, 512, 4242, 99991];

describe('buildWindows', () => {
  it('es determinista y no toca el RNG de simulacion', () => {
    // Salen de `decorSeed`: anadir detalle visual nunca desplaza la generacion
    // de la ciudad ni invalida una semilla compartida.
    expect(buildWindows(ciudad(1234))).toEqual(buildWindows(ciudad(1234)));
  });

  it('llena los edificios sin salirse de ellos', () => {
    for (const seed of SEMILLAS) {
      const city = ciudad(seed);
      const windows = buildWindows(city);
      expect(windows.length).toBeGreaterThan(20);

      for (const win of windows) {
        const edificio = city.buildings.find((b) => win.x >= b.x && win.x < b.x + b.width);
        expect(edificio).toBeDefined();
        expect(win.y).toBeGreaterThan(0);
        expect(win.y).toBeLessThan(edificio!.height);
      }
    }
  });

  it('la gran mayoria de ventanas son fijas', () => {
    for (const seed of SEMILLAS) {
      const windows = buildWindows(ciudad(seed));
      const animadas = windows.filter((w) => w.kind === 'blink' || w.kind === 'toggle');
      // Una ciudad entera parpadeando marea y le roba la atencion a la
      // trayectoria, que es lo que hay que mirar.
      expect(animadas.length / windows.length).toBeLessThan(0.1);
    }
  });

  it('cada ciudad tiene su propio caracter', () => {
    // Hay noches muertas y noches con movimiento: la proporcion de encendidas
    // no puede salir clavada en todas las partidas.
    const encendidas = SEMILLAS.map((seed) => {
      const w = buildWindows(ciudad(seed));
      return w.filter((x) => x.kind === 'on').length / w.length;
    });
    expect(new Set(encendidas.map((r) => r.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('los ciclos son muy lentos: nada de estroboscopio', () => {
    for (const seed of SEMILLAS) {
      for (const win of buildWindows(ciudad(seed))) {
        if (win.kind === 'blink' || win.kind === 'toggle') {
          // Un ciclo por debajo de ~10s se lee como parpadeo nervioso y le roba
          // la atencion al tiro.
          expect(win.period).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  it('ninguna ventana comparte periodo y desfase con otra', () => {
    const windows = buildWindows(ciudad(31337)).filter((w) => w.kind !== 'on' && w.kind !== 'off');
    const huellas = new Set(windows.map((w) => `${w.period}|${w.phase}|${w.duty}`));
    expect(huellas.size).toBe(windows.length);
  });
});

describe('isLit', () => {
  const base: CityWindow = { x: 0, y: 0, kind: 'on', period: 10, phase: 0, duty: 0.5 };

  it('las fijas no cambian nunca', () => {
    for (const t of [0, 3, 40, 1000]) {
      expect(isLit({ ...base, kind: 'on' }, t)).toBe(true);
      expect(isLit({ ...base, kind: 'off' }, t)).toBe(false);
    }
  });

  it('las animadas completan un ciclo en su periodo', () => {
    const win: CityWindow = { ...base, kind: 'toggle', period: 30, phase: 0, duty: 0.5 };
    expect(isLit(win, 0)).toBe(true);
    expect(isLit(win, 14)).toBe(true);
    expect(isLit(win, 16)).toBe(false);
    expect(isLit(win, 31)).toBe(true);
  });

  it('el duty manda cuanto tiempo pasa encendida', () => {
    const corta: CityWindow = { ...base, kind: 'blink', period: 10, phase: 0, duty: 0.25 };
    const larga: CityWindow = { ...base, kind: 'blink', period: 10, phase: 0, duty: 0.7 };
    expect(isLit(corta, 3)).toBe(false);
    expect(isLit(larga, 3)).toBe(true);
  });

  it('el desfase desincroniza ventanas iguales', () => {
    const a: CityWindow = { ...base, kind: 'toggle', period: 20, phase: 0, duty: 0.5 };
    const b: CityWindow = { ...a, phase: 0.5 };
    expect(isLit(a, 0)).not.toBe(isLit(b, 0));
  });
});
