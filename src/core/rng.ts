/**
 * PRNG determinista. Todo lo que afecte a la simulacion debe salir de aqui:
 * `Math.random` esta prohibido en `core/` porque los retos compartibles por URL
 * exigen que dos dispositivos generen exactamente la misma partida.
 */

/** Hash de string a semilla de 32 bits (xmur3). Estable entre plataformas. */
export function seedFromString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Semilla de la "ciudad del dia": misma para todo el mundo en la misma fecha UTC. */
export function dailySeed(date = new Date()): number {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return seedFromString(`gorilla-${y}-${m}-${d}`);
}

/**
 * mulberry32: rapido, sin estado oculto y reproducible con aritmetica entera de
 * 32 bits, que es identica en todos los motores JS.
 */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** Flotante en [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Flotante en [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Entero en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Semilla derivada, para desacoplar sub-sistemas del flujo principal. */
  derive(): number {
    return (this.next() * 4294967296) >>> 0;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick sobre lista vacia');
    return items[this.int(0, items.length - 1)]!;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}
