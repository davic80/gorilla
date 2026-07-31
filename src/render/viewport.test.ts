import { describe, expect, it } from 'vitest';
import { PLAY_HEIGHT, WORLD_WIDTH } from '../core/constants';
import { computeViewport, toScreenX, toScreenY, toWorldX, toWorldY } from './viewport';

/** iPhone vertical, el caso de referencia del proyecto. */
const movil = () => computeViewport(375, 812, 3, WORLD_WIDTH, PLAY_HEIGHT);

describe('computeViewport', () => {
  it('ancla el mundo al ancho: la arena es identica en cualquier movil', () => {
    for (const [w, h] of [
      [320, 568],
      [375, 812],
      [430, 932],
      [768, 1024],
    ] as const) {
      const vp = computeViewport(w, h, 2, WORLD_WIDTH, PLAY_HEIGHT);
      expect(vp.scale).toBeCloseTo(w / WORLD_WIDTH, 9);
      // Las 100u de arena ocupan exactamente el ancho util.
      expect(toScreenX(vp, WORLD_WIDTH)).toBeCloseTo(w, 6);
    }
  });

  it('invierte el eje Y: y=0 del mundo es la linea de suelo', () => {
    const vp = movil();
    expect(toScreenY(vp, 0)).toBeCloseTo(vp.groundY, 9);
    expect(toScreenY(vp, 10)).toBeLessThan(vp.groundY);
  });

  it('la conversion pantalla<->mundo es reversible', () => {
    const vp = movil();
    for (const [x, y] of [
      [0, 0],
      [50, 45],
      [99.5, 130],
    ] as const) {
      expect(toWorldX(vp, toScreenX(vp, x))).toBeCloseTo(x, 6);
      expect(toWorldY(vp, toScreenY(vp, y))).toBeCloseTo(y, 6);
    }
  });

  it('reserva franja de control suficiente para un arrastre largo', () => {
    const vp = movil();
    expect(vp.stripHeight).toBeGreaterThanOrEqual(168);
  });

  it('el inset seguro engorda la franja, no la come', () => {
    const sin = computeViewport(375, 812, 3, WORLD_WIDTH, PLAY_HEIGHT, 0);
    const con = computeViewport(375, 812, 3, WORLD_WIDTH, PLAY_HEIGHT, 34);
    expect(con.stripHeight).toBeCloseTo(sin.stripHeight + 34, 6);
    expect(con.groundY).toBeLessThan(sin.groundY);
  });

  it('en vertical sobra cielo y se convierte en banda de HUD', () => {
    const vp = movil();
    expect(vp.hudBandHeight).toBeGreaterThan(0);
    expect(vp.playTop).toBeCloseTo(vp.groundY - PLAY_HEIGHT * vp.scale, 6);
  });

  it('en apaisado la zona de juego se recorta en vez de encoger la arena', () => {
    // 812x375: la parabola completa no cabe. Se prefiere recortar por arriba a
    // cambiar la escala, que alteraria la jugabilidad entre dispositivos.
    const vp = computeViewport(812, 375, 2, WORLD_WIDTH, PLAY_HEIGHT);
    expect(vp.playTop).toBe(0);
    expect(vp.hudBandHeight).toBe(0);
    expect(vp.scale).toBeCloseTo(812 / WORLD_WIDTH, 9);
  });

  it('el suelo nunca sube por encima del 65% de la pantalla', () => {
    // Si la franja de control se comiera la vista, la ciudad desapareceria.
    for (const h of [400, 568, 812, 932, 1200]) {
      const vp = computeViewport(375, h, 2, WORLD_WIDTH, PLAY_HEIGHT, 34);
      expect(vp.groundY).toBeGreaterThanOrEqual(h * 0.35);
    }
  });
});
