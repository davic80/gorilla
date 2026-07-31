/**
 * Ajuste del canvas a la densidad de pixeles del dispositivo.
 *
 * Se limita el DPR a 3: por encima el coste de relleno se dispara en moviles de
 * gama media sin ganancia visible, y F0 se juega a 60 fps o no vale.
 */

const MAX_DPR = 3;

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D no disponible');
  return { canvas, ctx, cssWidth: 0, cssHeight: 0, dpr: 1 };
}

/** Redimensiona si hace falta. Devuelve true si cambio algo. */
export function syncStageSize(stage: Stage): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const rect = stage.canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);

  if (stage.cssWidth === cssWidth && stage.cssHeight === cssHeight && stage.dpr === dpr) {
    return false;
  }

  stage.canvas.width = Math.round(cssWidth * dpr);
  stage.canvas.height = Math.round(cssHeight * dpr);
  stage.cssWidth = cssWidth;
  stage.cssHeight = cssHeight;
  stage.dpr = dpr;

  // A partir de aqui se dibuja en pixeles CSS y el escalado lo aplica el ctx.
  stage.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}
