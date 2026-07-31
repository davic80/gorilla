/**
 * Proyeccion mundo -> pantalla.
 *
 * El mundo esta anclado al ANCHO: 100u ocupan siempre el ancho util de la
 * pantalla, asi que la arena es identica en cualquier movil. Lo que varia entre
 * dispositivos es cuanto cielo se ve por encima, nunca la jugabilidad.
 *
 * Bajo el suelo se reserva la franja de control, para que el dedo del jugador
 * nunca tape la ciudad ni la trayectoria.
 */

export interface Viewport {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  /** Pixeles CSS por unidad de mundo. */
  scale: number;
  /** Y en pixeles CSS de la linea de suelo. */
  groundY: number;
  /** Altura de la franja de control tactil, en pixeles CSS. */
  stripHeight: number;
  /** Unidades de mundo visibles por encima del suelo. */
  visibleHeight: number;
  /**
   * Y en pixeles CSS donde arranca la zona de juego (skyline + parabolas). Por
   * encima queda banda de HUD: en vertical siempre sobra cielo, y darle un uso
   * explicito es la diferencia entre composicion y hueco muerto.
   */
  playTop: number;
  hudBandHeight: number;
  /** Inset superior seguro, para que el canvas no dibuje bajo la muesca. */
  safeTop: number;
  /**
   * Y donde empieza el pie de pagina. Toda la franja de abajo es zona de tiro,
   * asi que cualquier cosa pulsable ahi robaria arrastres: esta banda queda
   * fuera del gesto para que el enlace sea alcanzable sin pelearse con el.
   */
  footerTop: number;
}

/**
 * Franja de control: es la zona de tiro, y el gesto empieza justo en la linea de
 * suelo o por debajo. Generosa a proposito — cuanto mas sitio para tensar, mas
 * resolucion tiene el modo fino.
 */
const MIN_STRIP = 200;
const STRIP_RATIO = 0.28;

/**
 * Alto del pie de pagina, sin contar el inset seguro del movil.
 *
 * Toda la franja de abajo es zona de tiro, asi que cualquier cosa pulsable ahi
 * robaria arrastres. Esta banda queda fuera del gesto para que el enlace sea
 * alcanzable sin pelearse con el.
 */
export const FOOTER_H = 48;

export function computeViewport(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  worldWidth: number,
  playHeight: number,
  safeBottom = 0,
  safeTop = 0,
): Viewport {
  const scale = cssWidth / worldWidth;
  const stripHeight = Math.max(MIN_STRIP, cssHeight * STRIP_RATIO) + safeBottom;
  const groundY = Math.max(cssHeight * 0.35, cssHeight - stripHeight);

  // En pantallas anchas o bajas la zona de juego no cabe entera: se recorta por
  // arriba y los globos muy altos salen de cuadro. Es preferible a encoger la
  // arena, que si cambiaria la jugabilidad entre dispositivos.
  const playTop = Math.max(0, groundY - playHeight * scale);

  return {
    cssWidth,
    cssHeight,
    dpr,
    scale,
    groundY,
    stripHeight: cssHeight - groundY,
    visibleHeight: groundY / scale,
    playTop,
    hudBandHeight: playTop,
    safeTop,
    footerTop: cssHeight - (FOOTER_H + safeBottom),
  };
}

export function toScreenX(vp: Viewport, worldX: number): number {
  return worldX * vp.scale;
}

/** El eje Y del mundo apunta hacia arriba; aqui se invierte. */
export function toScreenY(vp: Viewport, worldY: number): number {
  return vp.groundY - worldY * vp.scale;
}

export function toWorldX(vp: Viewport, screenX: number): number {
  return screenX / vp.scale;
}

export function toWorldY(vp: Viewport, screenY: number): number {
  return (vp.groundY - screenY) / vp.scale;
}

/** Lee un inset seguro publicado por el CSS (muesca y barra de gestos de iOS). */
export function readSafeInset(el: HTMLElement, name: '--safe-top' | '--safe-bottom'): number {
  const n = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(n) ? n : 0;
}
