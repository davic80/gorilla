import { describe, expect, it } from 'vitest';
import { generateCity } from './city';
import { PHYSICS, PLAY_HEIGHT, WORLD_WIDTH } from './constants';
import { FIXED_STEP } from './loop';
import { Rng } from './rng';
import { Terrain, TERRAIN_RES } from './terrain';

describe('Terrain.fromCity', () => {
  it('rellena cada edificio hasta su altura', () => {
    const city = generateCity(new Rng(4242));
    const terrain = Terrain.fromCity(city);

    for (const b of city.buildings) {
      const centro = b.x + b.width / 2;
      expect(terrain.solidAt(centro, b.height - 0.5)).toBe(true);
      expect(terrain.solidAt(centro, b.height + 1)).toBe(false);
    }
  });

  it('deja pasar el hueco entre edificios', () => {
    const city = generateCity(new Rng(777));
    const terrain = Terrain.fromCity(city);
    // Justo en la junta de dos edificios debe haber aire cerca del suelo.
    const junta = city.buildings[1]!.x;
    expect(terrain.solidAt(junta, 1)).toBe(false);
  });

  it('es determinista para la misma semilla', () => {
    const a = Terrain.fromCity(generateCity(new Rng(31337)));
    const b = Terrain.fromCity(generateCity(new Rng(31337)));
    expect(a.cells).toEqual(b.cells);
  });
});

describe('Terrain.solidAt', () => {
  const terrain = () => Terrain.fromCity(generateCity(new Rng(1)));

  it('el subsuelo es solido', () => {
    expect(terrain().solidAt(50, -0.1)).toBe(true);
    expect(terrain().solidAt(50, -99)).toBe(true);
  });

  it('el cielo por encima de la mascara es libre', () => {
    expect(terrain().solidAt(50, PLAY_HEIGHT + 1)).toBe(false);
  });

  it('fuera de la arena no hay terreno', () => {
    expect(terrain().solidAt(-1, 5)).toBe(false);
    expect(terrain().solidAt(WORLD_WIDTH + 1, 5)).toBe(false);
  });
});

describe('Terrain.carve', () => {
  it('abre un crater circular', () => {
    const city = generateCity(new Rng(99));
    const terrain = Terrain.fromCity(city);
    const b = city.buildings[2]!;
    const cx = b.x + b.width / 2;
    const cy = b.height / 2;

    expect(terrain.solidAt(cx, cy)).toBe(true);
    terrain.carve(cx, cy, 3);

    expect(terrain.solidAt(cx, cy)).toBe(false);
    // Justo fuera del radio sigue habiendo material.
    expect(terrain.solidAt(cx, cy - 3.6)).toBe(true);
  });

  it('devuelve la region tocada para repintar solo eso', () => {
    const terrain = Terrain.fromCity(generateCity(new Rng(5)));
    const rect = terrain.carve(50, 10, 2);
    expect(rect.x0).toBeLessThan(rect.x1);
    expect(rect.y0).toBeLessThan(rect.y1);
    expect(rect.x1 - rect.x0).toBeGreaterThanOrEqual(2 * 2 * TERRAIN_RES - 1);
  });

  it('no se sale de la mascara al borde', () => {
    const terrain = Terrain.fromCity(generateCity(new Rng(6)));
    const rect = terrain.carve(0.2, 0.2, 6);
    expect(rect.x0).toBeGreaterThanOrEqual(0);
    expect(rect.y0).toBeGreaterThanOrEqual(0);
    expect(() => terrain.carve(WORLD_WIDTH - 0.1, PLAY_HEIGHT - 0.1, 8)).not.toThrow();
  });
});

describe('Terrain.traceSegment', () => {
  it('devuelve el primer punto solido, no uno cualquiera', () => {
    const terrain = new Terrain();
    // Muro vertical de una sola celda de grosor en x = 50.
    const wallX = Math.floor(50 * TERRAIN_RES);
    for (let y = 0; y < 40 * TERRAIN_RES; y++) terrain.cells[y * terrain.cols + wallX] = 1;

    const hit = terrain.traceSegment(45, 10, 55, 10);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeGreaterThanOrEqual(49.9);
    expect(hit!.x).toBeLessThanOrEqual(50.3);
  });

  it('no hay tunneling al maximo de velocidad', () => {
    // Un paso fijo a velocidad maxima recorre esto; ningun muro debe colarse.
    const paso = PHYSICS.maxSpeed * FIXED_STEP;
    const terrain = new Terrain();
    const wallX = Math.floor(50 * TERRAIN_RES);
    for (let y = 0; y < 40 * TERRAIN_RES; y++) terrain.cells[y * terrain.cols + wallX] = 1;

    // Se barre el segmento por todo el entorno del muro: en ninguna posicion
    // de partida puede pasar de largo.
    for (let offset = 0; offset < paso; offset += 0.01) {
      const x0 = 50 - paso + offset;
      const hit = terrain.traceSegment(x0, 10, x0 + paso, 10);
      if (x0 + paso >= 50 && x0 <= 50.2) expect(hit).not.toBeNull();
    }
  });

  it('devuelve null si el segmento no toca nada', () => {
    const terrain = Terrain.fromCity(generateCity(new Rng(8)));
    expect(terrain.traceSegment(10, PLAY_HEIGHT - 2, 90, PLAY_HEIGHT - 2)).toBeNull();
  });

  it('detecta el suelo al caer', () => {
    const terrain = new Terrain();
    expect(terrain.traceSegment(50, 2, 50, -1)).not.toBeNull();
  });
});
