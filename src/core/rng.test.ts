import { describe, expect, it } from 'vitest';
import { Rng, dailySeed, seedFromString } from './rng';

describe('Rng', () => {
  it('la misma semilla produce la misma secuencia', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('semillas distintas divergen', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next se mantiene en [0, 1)', () => {
    const rng = new Rng(999);
    for (let i = 0; i < 20000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int cubre los dos extremos y no se sale', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(3, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('range respeta los limites', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 5000; i++) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it('derive devuelve enteros de 32 bits sin signo', () => {
    const rng = new Rng(2024);
    for (let i = 0; i < 1000; i++) {
      const v = rng.derive();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('pick sobre lista vacia falla en vez de devolver undefined', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });
});

describe('seedFromString', () => {
  it('es estable para la misma entrada', () => {
    expect(seedFromString('gorilla')).toBe(seedFromString('gorilla'));
  });

  it('distingue entradas parecidas', () => {
    expect(seedFromString('gorilla-2026-07-30')).not.toBe(seedFromString('gorilla-2026-07-31'));
  });

  it('devuelve un entero de 32 bits sin signo', () => {
    for (const s of ['', 'a', 'ciudad del dia', '🍌']) {
      const v = seedFromString(s);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('dailySeed', () => {
  it('solo depende de la fecha UTC, no de la hora', () => {
    const manana = new Date(Date.UTC(2026, 6, 30, 0, 5));
    const noche = new Date(Date.UTC(2026, 6, 30, 23, 55));
    expect(dailySeed(manana)).toBe(dailySeed(noche));
  });

  it('cambia de un dia al siguiente', () => {
    const hoy = new Date(Date.UTC(2026, 6, 30));
    const manana = new Date(Date.UTC(2026, 6, 31));
    expect(dailySeed(hoy)).not.toBe(dailySeed(manana));
  });
});
