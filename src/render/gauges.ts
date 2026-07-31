/**
 * Indicadores de angulo y potencia.
 *
 * Van ARRIBA, no en la franja de control, porque es abajo donde esta el dedo: un
 * indicador tapado por tu propia mano justo mientras apuntas no sirve de nada.
 *
 * Cada uno lleva la marca del tiro anterior. Sin botones de ajuste, esa
 * referencia es lo que permite seguir horquillando: ves de donde vienes y
 * cuanto te has movido, no solo donde estas.
 */

import { ANGLE_MAX, ANGLE_MIN, type Aim } from '../core/match';
import { t } from '../i18n';
import type { Viewport } from './viewport';

const TRACK = '#2a3563';
const MUTED = '#8d9bc0';
const ARC_R = 30;
/** Desde arriba de la pantalla hasta donde acaba el bloque de indicadores. */
const GAUGES_TOP = 64;
export const GAUGES_BOTTOM = 160;

const WEDGE_W = 124;
const WEDGE_H = 26;

/**
 * Rampa de la potencia: verde tranquilo, rojo peligroso. Da lectura de un
 * vistazo sin mirar la cifra, y hace que pasarse de fuerza se SIENTA excesivo.
 */
const RAMP: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [74, 222, 128]],
  [0.4, [250, 204, 21]],
  [0.7, [251, 146, 60]],
  [1, [239, 68, 68]],
];

export function powerColor(power: number): string {
  const t = Math.max(0, Math.min(1, power / 100));
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i]!;
    const [t0, c0] = RAMP[i - 1]!;
    if (t > t1) continue;
    const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
    return `rgb(${mix(c0[0], c1[0])} ${mix(c0[1], c1[1])} ${mix(c0[2], c1[2])})`;
  }
  const last = RAMP[RAMP.length - 1]![1];
  return `rgb(${last[0]} ${last[1]} ${last[2]})`;
}

export interface GaugeInput {
  aim: Aim;
  previous: Aim | null;
  facing: 1 | -1;
  color: string;
  /** 0..1, destello del ultimo tick. */
  glow: number;
  /** Arrastre pasado del tramo grueso: la ganancia cae a un cuarto. */
  fine: boolean;
}

/** Angulo de mundo a angulo de canvas, teniendo en cuenta hacia donde se mira. */
export function toCanvasAngle(worldDeg: number, facing: 1 | -1): number {
  const rad = (worldDeg * Math.PI) / 180;
  return facing === 1 ? -rad : Math.PI + rad;
}

export function drawGauges(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  input: GaugeInput,
): void {
  // Los medidores arriba y las cifras debajo, sin solaparse: a un pulgar de
  // distancia y con el numero como ancla de lectura.
  const y0 = vp.safeTop + GAUGES_TOP;
  const colA = vp.cssWidth / 2 - 76;
  const colB = vp.cssWidth / 2 + 76;
  const baseline = y0 + 76;

  ctx.save();
  // Sombra propia: sin banda opaca detras, los indicadores tienen que
  // despegarse del cielo por si solos.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  drawAngle(ctx, colA, y0 + 34, input);
  drawPower(ctx, colB, y0 + 44, input);

  drawValue(ctx, colA, baseline, `${Math.round(input.aim.angle)}°`, '∠', input, '#e8edfb');
  // La cifra toma el color de la rampa: refuerza la lectura de la cuña en vez
  // de competir con ella.
  drawValue(
    ctx,
    colB,
    baseline,
    String(Math.round(input.aim.power)),
    '⚡',
    input,
    powerColor(input.aim.power),
  );

  ctx.restore();

  // Sin readout de texto, esta es la unica senal de que has cruzado al tramo
  // de precision. Va arriba, no bajo el dedo.
  if (input.fine) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = input.color;
    ctx.fillText(t('precision'), colB, baseline + 16);
    ctx.restore();
  }
}

function drawAngle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  input: GaugeInput,
): void {
  // El arco se muestrea en vez de usar ctx.arc: asi el sentido de giro sale
  // solo al espejar el gorila que mira a la izquierda.
  const path = (from: number, to: number) => {
    ctx.beginPath();
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const deg = from + ((to - from) * i) / steps;
      const a = toCanvasAngle(deg, input.facing);
      const x = cx + Math.cos(a) * ARC_R;
      const y = cy + Math.sin(a) * ARC_R;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  ctx.save();
  ctx.lineCap = 'round';

  // Solo carril y aguja. Anadir tambien un arco de progreso llenaba el medidor
  // de trazos y costaba mas leerlo, no menos.
  ctx.strokeStyle = TRACK;
  ctx.lineWidth = 3;
  path(ANGLE_MIN, ANGLE_MAX);

  if (input.previous) mark(ctx, cx, cy, input.previous.angle, input.facing);

  // La aguja apunta a donde saldra el platano: la direccion se lee sin leer.
  const a = toCanvasAngle(input.aim.angle, input.facing);
  ctx.strokeStyle = input.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * ARC_R, cy + Math.sin(a) * ARC_R);
  ctx.stroke();

  ctx.fillStyle = input.color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function mark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  deg: number,
  facing: 1 | -1,
): void {
  const a = toCanvasAngle(deg, facing);
  ctx.save();
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * (ARC_R - 7), cy + Math.sin(a) * (ARC_R - 7));
  ctx.lineTo(cx + Math.cos(a) * (ARC_R + 6), cy + Math.sin(a) * (ARC_R + 6));
  ctx.stroke();
  ctx.restore();
}

/**
 * Cuña: la barra crece a lo ancho Y a lo alto. La altura hace que la diferencia
 * entre 30 y 90 se vea de reojo, cosa que una barra plana no consigue.
 */
function wedgePath(ctx: CanvasRenderingContext2D, x0: number, yBase: number, width: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, yBase);
  ctx.lineTo(x0 + width, yBase);
  ctx.lineTo(x0 + width, yBase - (width / WEDGE_W) * WEDGE_H);
  ctx.closePath();
}

function drawPower(
  ctx: CanvasRenderingContext2D,
  cx: number,
  yBase: number,
  input: GaugeInput,
): void {
  const x0 = cx - WEDGE_W / 2;
  ctx.save();

  ctx.fillStyle = TRACK;
  wedgePath(ctx, x0, yBase, WEDGE_W);
  ctx.fill();

  const fill = (input.aim.power / 100) * WEDGE_W;
  if (fill > 1) {
    // Se recorta la cuña completa en vez de dibujar una mas pequena: asi el
    // perfil del relleno coincide siempre con el del carril.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, yBase - WEDGE_H, fill, WEDGE_H);
    ctx.clip();
    ctx.fillStyle = powerColor(input.aim.power);
    wedgePath(ctx, x0, yBase, WEDGE_W);
    ctx.fill();
    ctx.restore();
  }

  if (input.previous) {
    const px = x0 + (input.previous.power / 100) * WEDGE_W;
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, yBase + 4);
    ctx.lineTo(px, yBase - (input.previous.power / 100) * WEDGE_H - 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawValue(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseline: number,
  value: string,
  glyph: string,
  input: GaugeInput,
  valueColor: string,
): void {
  const VALUE_FONT = '700 30px ui-monospace, SFMono-Regular, Menlo, monospace';
  const GLYPH_FONT = '500 17px ui-sans-serif, system-ui, sans-serif';
  const GAP = 9;
  /** Los glifos son mucho mas pequenos que la cifra: se suben para que el */
  /** conjunto quede centrado a ojo, no alineado por linea base.           */
  const GLYPH_RISE = 7;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // El destello del tick es el unico canal de respuesta que no depende de
  // hardware ni de ajustes: en iPhone o en silencio, es lo unico que queda.
  ctx.translate(cx, baseline);
  ctx.scale(1 + input.glow * 0.08, 1 + input.glow * 0.08);

  ctx.font = VALUE_FONT;
  const valueWidth = ctx.measureText(value).width;
  ctx.font = GLYPH_FONT;
  const glyphWidth = ctx.measureText(glyph).width;
  const left = -(glyphWidth + GAP + valueWidth) / 2;

  ctx.fillStyle = MUTED;
  ctx.fillText(glyph, left, -GLYPH_RISE);

  ctx.font = VALUE_FONT;
  ctx.fillStyle = valueColor;
  // Sin destello, sombra de legibilidad; con destello, resplandor del color.
  ctx.shadowOffsetY = input.glow > 0 ? 0 : 3;
  ctx.shadowColor = input.glow > 0 ? valueColor : 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = input.glow > 0 ? input.glow * 16 : 10;
  ctx.fillText(value, left + glyphWidth + GAP, 0);
  ctx.restore();
}
