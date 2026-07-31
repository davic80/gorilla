/**
 * Terreno destruible como mascara de celdas.
 *
 * Es la unica fuente de verdad de "que es solido": el render pinta a partir de
 * ella, no al reves. Hereda la idea del `POINT()` del original de 1991, que
 * consultaba los pixeles ya dibujados, pero sin depender del canvas y sin el
 * tunneling que sufria a alta velocidad.
 *
 * Cada celda guarda 0 = aire, o 1+indice de edificio, para que el render pueda
 * variar el tono por edificio y los crateres conserven ese tono en los bordes.
 */

import type { City } from './city';
import { CITY, PLAY_HEIGHT, WORLD_WIDTH } from './constants';

/** Celdas por unidad de mundo. A escala de movil, ~0,75 px por celda. */
export const TERRAIN_RES = 5;

export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Terrain {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;

  constructor(worldWidth = WORLD_WIDTH, worldHeight = PLAY_HEIGHT) {
    this.cols = Math.round(worldWidth * TERRAIN_RES);
    this.rows = Math.round(worldHeight * TERRAIN_RES);
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  static fromCity(city: City): Terrain {
    const t = new Terrain();
    city.buildings.forEach((b, i) => {
      // El hueco entre edificios es real, no solo visual: deja pasar tiros
      // rasantes y es parte del escenario.
      const x0 = Math.ceil((b.x + CITY.gap / 2) * TERRAIN_RES);
      const x1 = Math.floor((b.x + b.width - CITY.gap / 2) * TERRAIN_RES);
      const y1 = Math.min(t.rows, Math.round(b.height * TERRAIN_RES));
      const material = (i % 255) + 1;

      for (let y = 0; y < y1; y++) {
        const row = y * t.cols;
        for (let x = Math.max(0, x0); x < Math.min(t.cols, x1); x++) {
          t.cells[row + x] = material;
        }
      }
    });
    return t;
  }

  /** Suelo y subsuelo son solidos; el cielo abierto por arriba no lo es. */
  solidAt(worldX: number, worldY: number): boolean {
    if (worldY < 0) return true;
    if (worldY >= this.rows / TERRAIN_RES) return false;
    if (worldX < 0 || worldX >= this.cols / TERRAIN_RES) return false;

    const cx = Math.floor(worldX * TERRAIN_RES);
    const cy = Math.floor(worldY * TERRAIN_RES);
    return this.cells[cy * this.cols + cx]! !== 0;
  }

  materialAt(cellX: number, cellY: number): number {
    if (cellX < 0 || cellX >= this.cols || cellY < 0 || cellY >= this.rows) return 0;
    return this.cells[cellY * this.cols + cellX]!;
  }

  /** Abre un crater circular. Devuelve la region tocada para repintar solo eso. */
  carve(worldX: number, worldY: number, radius: number): DirtyRect {
    const cx = worldX * TERRAIN_RES;
    const cy = worldY * TERRAIN_RES;
    const r = radius * TERRAIN_RES;

    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.cols - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.rows - 1, Math.ceil(cy + r));
    const r2 = r * r;

    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const row = y * this.cols;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) this.cells[row + x] = 0;
      }
    }

    return { x0, y0, x1, y1 };
  }

  /**
   * Primer punto solido a lo largo de un segmento, o null.
   *
   * Se muestrea a media celda: a velocidad maxima un paso fijo recorre ~2
   * celdas, asi que ningun impacto se cuela entre muestras. Esto es lo que
   * evita el tunneling que tenia el original.
   */
  traceSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { x: number; y: number } | null {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const stepWorld = 0.5 / TERRAIN_RES;
    const steps = Math.max(1, Math.ceil(dist / stepWorld));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (this.solidAt(x, y)) return { x, y };
    }
    return null;
  }
}
