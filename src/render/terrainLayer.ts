/**
 * Capa visual del terreno, pintada A PARTIR de la mascara de colision.
 *
 * Una sola fuente de verdad: si la mascara dice que ahi no hay nada, ahi no se
 * pinta nada. Mantener rectangulos por un lado y crateres por otro terminaria
 * en que lo que ves y lo que choca dejan de coincidir.
 *
 * Solo se repinta la region que toca cada explosion, asi que un crater cuesta
 * unos cientos de pixeles, no la ciudad entera.
 */

import { PLAY_HEIGHT } from '../core/constants';
import type { DirtyRect, Terrain } from '../core/terrain';
import type { Viewport } from './viewport';
import { toScreenY } from './viewport';

/** Tono por edificio: sin variacion la silueta se lee como un bloque unico. */
function toneFor(material: number): [number, number, number] {
  const t = 26 + ((material - 1) % 3) * 9;
  return [t, t + 6, t + 20];
}

export class TerrainLayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(private readonly terrain: Terrain) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = terrain.cols;
    this.canvas.height = terrain.rows;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible para el terreno');
    this.ctx = ctx;
    this.image = ctx.createImageData(terrain.cols, terrain.rows);
    this.syncAll();
  }

  syncAll(): void {
    this.sync({ x0: 0, y0: 0, x1: this.terrain.cols - 1, y1: this.terrain.rows - 1 });
  }

  /** Repinta una region. Coordenadas en celdas, con Y hacia arriba. */
  sync(rect: DirtyRect): void {
    const { cols, rows } = this.terrain;
    const x0 = Math.max(0, rect.x0);
    const x1 = Math.min(cols - 1, rect.x1);
    const y0 = Math.max(0, rect.y0);
    const y1 = Math.min(rows - 1, rect.y1);
    if (x1 < x0 || y1 < y0) return;

    const data = this.image.data;
    for (let cellY = y0; cellY <= y1; cellY++) {
      // La mascara tiene Y hacia arriba y el canvas hacia abajo.
      const imageY = rows - 1 - cellY;
      for (let cellX = x0; cellX <= x1; cellX++) {
        const material = this.terrain.materialAt(cellX, cellY);
        const i = (imageY * cols + cellX) * 4;
        if (material === 0) {
          data[i + 3] = 0;
          continue;
        }
        const [r, g, b] = toneFor(material);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

    const top = rows - 1 - y1;
    this.ctx.clearRect(x0, top, x1 - x0 + 1, y1 - y0 + 1);
    this.ctx.putImageData(this.image, 0, 0, x0, top, x1 - x0 + 1, y1 - y0 + 1);
  }

  draw(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    ctx.drawImage(
      this.canvas,
      0,
      toScreenY(vp, PLAY_HEIGHT),
      vp.cssWidth,
      PLAY_HEIGHT * vp.scale,
    );
  }
}
