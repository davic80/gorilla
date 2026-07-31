/**
 * Fondo: luna y nubes en varios planos.
 *
 * Es lo que convierte el cielo sobrante del formato vertical (hallazgo 2 de F0)
 * en atmosfera en lugar de hueco muerto. Se mueve muy despacio a proposito: el
 * fondo tiene que dar profundidad sin robarle la atencion a la trayectoria.
 *
 * Generado desde la semilla de la ciudad: dos moviles con la misma semilla ven
 * exactamente el mismo cielo.
 */

import type { City } from '../core/city';
import { PLAY_HEIGHT, WORLD_WIDTH } from '../core/constants';
import { Rng } from '../core/rng';
import type { Viewport } from './viewport';
import { toScreenX, toScreenY } from './viewport';

/** Margen a cada lado para que las nubes entren y salgan sin aparecer de golpe. */
const WRAP_MARGIN = 40;
const WRAP_SPAN = WORLD_WIDTH + WRAP_MARGIN * 2;

const MOON_COLOR = '#e6ecff';
const SKY_COLOR = '#0b1026';

/** Tres planos: cuanto mas lejos, mas tenue, mas grande y mas lento. */
const LAYERS = [
  { parallax: 0.34, alpha: 0.05, scale: 2.1, count: 3 },
  { parallax: 0.68, alpha: 0.07, scale: 1.5, count: 3 },
  { parallax: 1.15, alpha: 0.095, scale: 1, count: 4 },
] as const;

/**
 * Unidades de mundo por segundo y por unidad de viento.
 *
 * Las nubes son el indicador ambiental del viento: van hacia donde empuja y a
 * su ritmo, asi que con viento fuerte se ve sin mirar el numero. Con viento
 * cero se quedan quietas, que es lo correcto.
 */
const CLOUD_WIND = 0.13;

/** Avance del cielo en este frame. El acumulado lo lleva el bucle principal. */
export function cloudDriftStep(wind: number, delta: number): number {
  return wind * CLOUD_WIND * delta;
}

/** Achatado vertical: un racimo de circulos redondos parece uvas, no una nube. */
const CLOUD_SQUASH = 0.62;

interface Blob {
  dx: number;
  dy: number;
  r: number;
}

export interface Cloud {
  x: number;
  y: number;
  /** Factor de plano: el fondo se arrastra menos que el frente. */
  parallax: number;
  alpha: number;
  blobs: Blob[];
}

export interface Moon {
  x: number;
  y: number;
  r: number;
  /** 0 = llena; mayor recorta mas creciente. */
  phase: number;
  tilt: number;
}

export interface Sky {
  moon: Moon;
  clouds: Cloud[];
}

export function buildSky(city: City): Sky {
  const rng = new Rng((city.seed ^ 0x5bf03635) >>> 0);

  const moon: Moon = {
    x: rng.range(12, WORLD_WIDTH - 12),
    y: rng.range(PLAY_HEIGHT * 0.5, PLAY_HEIGHT * 0.85),
    r: rng.range(4.5, 8),
    // La mayoria de noches sale creciente; llena de vez en cuando.
    phase: rng.bool(0.3) ? 0 : rng.range(0.35, 0.95),
    tilt: rng.range(0, Math.PI * 2),
  };

  const clouds: Cloud[] = [];
  for (const layer of LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      const blobs: Blob[] = [];
      const puffs = rng.int(5, 8);
      for (let p = 0; p < puffs; p++) {
        blobs.push({
          dx: rng.range(-9, 9) * layer.scale,
          dy: rng.range(-1.4, 1.4) * layer.scale,
          r: rng.range(2.6, 4.6) * layer.scale,
        });
      }

      clouds.push({
        x: rng.range(0, WRAP_SPAN),
        y: rng.range(PLAY_HEIGHT * 0.35, PLAY_HEIGHT * 1.05),
        // Cada nube desvia un poco del plano al que pertenece.
        parallax: layer.parallax * rng.range(0.8, 1.25),
        alpha: layer.alpha * rng.range(0.8, 1.2),
        blobs,
      });
    }
  }

  return { moon, clouds };
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  sky: Sky,
  drift: number,
): void {
  ctx.save();
  // El cielo llega hasta arriba del todo: la banda de indicadores es
  // transparente y las nubes y la luna pasan por detras. La legibilidad la
  // resuelve el velo degradado del render, no un recorte.
  ctx.beginPath();
  ctx.rect(0, 0, vp.cssWidth, vp.groundY);
  ctx.clip();

  drawMoon(ctx, vp, sky.moon);
  for (const cloud of sky.clouds) drawCloud(ctx, vp, cloud, drift);

  ctx.restore();
}

function drawMoon(ctx: CanvasRenderingContext2D, vp: Viewport, moon: Moon): void {
  // Fija: es el unico punto de referencia inmovil del cielo, y el contraste con
  // las nubes a la deriva es justo lo que hace legible el viento.
  const cx = toScreenX(vp, moon.x);
  const cy = toScreenY(vp, moon.y);
  const r = moon.r * vp.scale;

  ctx.save();

  // Halo con degradado radial. Un circulo plano a baja opacidad no parece un
  // resplandor: parece un segundo planeta gris detras de la luna.
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.6);
  halo.addColorStop(0, 'rgba(230, 236, 255, 0.13)');
  halo.addColorStop(1, 'rgba(230, 236, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Todo lo de la luna se recorta a su propio disco. Sin este recorte, el
  // circulo de sombra se sale por el otro lado y lo que se ve son dos discos
  // solapados en vez de un creciente: con la regla de relleno "nonzero", la
  // parte del circulo interior que sobresale cuenta -1 y tambien se rellena.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = MOON_COLOR;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  if (moon.phase > 0) {
    // La sombra no se pinta de un color plano: se reconstruye el fondo exacto
    // que habia detras (cielo mas halo), asi que no deja mordisco visible.
    ctx.globalAlpha = 1;
    const sx = cx + Math.cos(moon.tilt) * r * moon.phase;
    const sy = cy + Math.sin(moon.tilt) * r * moon.phase;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = SKY_COLOR;
    ctx.fill();
    ctx.fillStyle = halo;
    ctx.fill();
  }
  ctx.restore();
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  cloud: Cloud,
  drift: number,
): void {
  const x = wrap(cloud.x + drift * cloud.parallax);
  const cx = toScreenX(vp, x - WRAP_MARGIN);
  const cy = toScreenY(vp, cloud.y);

  ctx.save();
  ctx.globalAlpha = cloud.alpha;
  ctx.fillStyle = '#93a8e0';
  // Un solo trazado con todos los bultos: se evita que las circunferencias
  // superpuestas se sumen y dibujen costuras dentro de la nube.
  ctx.beginPath();
  for (const blob of cloud.blobs) {
    ctx.moveTo(cx + (blob.dx + blob.r) * vp.scale, cy - blob.dy * vp.scale);
    ctx.ellipse(
      cx + blob.dx * vp.scale,
      cy - blob.dy * vp.scale,
      blob.r * vp.scale,
      blob.r * CLOUD_SQUASH * vp.scale,
      0,
      0,
      Math.PI * 2,
    );
  }
  ctx.fill();
  ctx.restore();
}

/** Da la vuelta al mundo en horizontal sin saltos. */
function wrap(x: number): number {
  return ((x % WRAP_SPAN) + WRAP_SPAN) % WRAP_SPAN;
}
