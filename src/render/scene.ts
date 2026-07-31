/**
 * Render de la partida.
 *
 * Jerarquia de lectura, que es lo unico aqui que no es provisional: fantasma del
 * tiro anterior por debajo, arco de ayuda por encima, y el platano siempre el
 * elemento mas brillante de la pantalla.
 */

import { rooftop } from '../core/city';
import type { Match } from '../core/match';
import type { DragInfo } from '../input/aim';
import { PULL_COARSE } from '../input/aim';
import { GAUGES_BOTTOM, drawGauges, powerColor, toCanvasAngle } from './gauges';
import type { TerrainLayer } from './terrainLayer';
import type { Viewport } from './viewport';
import { toScreenX, toScreenY } from './viewport';
import { drawSky, type Sky } from './sky';
import { drawWindows, type CityWindow } from './windows';

export const BANANA_R = 1.5;

export type GestureKind = 'hoot' | 'chest';

export interface Gesture {
  kind: GestureKind;
  /** Segundos transcurridos del gesto. */
  t: number;
}

/**
 * Los dos gestos comparten motor y se distinguen por el barrido de los brazos:
 * el "uh uh uh" los lanza hacia ARRIBA y afuera; el golpe de pecho los cruza
 * hacia DENTRO, contra el torso. De ahi que uno tenga barrido positivo y el
 * otro negativo.
 */
export const GESTURE = {
  hoot: { duration: 1.08, pumps: 3, sweep: Math.PI * 0.75 },
  chest: { duration: 1.05, pumps: 4, sweep: -0.95 },
} as const;

/** Cuanto dura el agacharse, en segundos. */
export const DUCK_DURATION = 1.05;

// Algo mas grandes que la caja de golpeo: el radio de salpicadura (5,5u desde
// el centro) es mas ancho que el cuerpo, asi que verlos grandes no engaña.
const BODY_W = 7.8;
const BODY_H = 8.2;

const SKY = '#0b1026';
const STRIP = '#070b1c';
const STRIP_LINE = '#1b2544';

const PLAYER_COLOR = ['#5ee6a8', '#ff8fa3'] as const;
const PLAYER_DARK = ['#2b8f66', '#c2607a'] as const;
const PLAYER_LIGHT = ['#b6f7da', '#ffd2dc'] as const;

/** Brazos en reposo: caidos y ligeramente abiertos. */
const REST_SPREAD = 0.3;

export interface SceneInput {
  match: Match;
  terrainLayer: TerrainLayer;
  sky: Sky;
  windows: readonly CityWindow[];
  /** Punto interpolado del platano, o null si no hay vuelo. */
  banana: { x: number; y: number } | null;
  drag: DragInfo | null;
  /** Arco de ayuda ya simulado, vacio si el nivel es "leyenda". */
  hint: Array<{ x: number; y: number }>;
  /** 0..1, destello del ultimo tick de punteria. */
  glow: number;
  /** El arrastre esta en modo fino. */
  fine: boolean;
  /** Gesto en curso de cada jugador, o null. */
  gestures: readonly [Gesture | null, Gesture | null];
  /** Segundos que lleva agachado cada jugador, o null. */
  ducks: readonly [number | null, number | null];
  /** Segundos de la demo del gesto, o null si ya se ha arrastrado alguna vez. */
  touchHint: number | null;
  /** Arrastre acumulado del cielo, en unidades de mundo. */
  cloudDrift: number;
  time: number;
}

export function drawScene(ctx: CanvasRenderingContext2D, vp: Viewport, input: SceneInput): void {
  const { match } = input;

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, vp.cssWidth, vp.cssHeight);
  drawSky(ctx, vp, input.sky, input.cloudDrift);
  drawTopScrim(ctx, vp);

  // Los indicadores van al fondo: importan mientras apuntas, y asi el platano
  // les pasa por delante en vez de quedar tapado por ellos.
  const shooter = match.players[match.current];
  drawGauges(ctx, vp, {
    aim: shooter.aim,
    previous: shooter.lastShot,
    facing: shooter.facing,
    color: PLAYER_COLOR[match.current],
    glow: input.glow,
    fine: input.fine,
  });

  input.terrainLayer.draw(ctx, vp);
  drawWindows(ctx, vp, match.terrain, input.windows, input.time);

  drawGhosts(ctx, vp, match);
  if (match.phase === 'aiming') drawHint(ctx, vp, input.hint, match.current);
  drawGorillas(ctx, vp, match, input.time, input.gestures, input.ducks);
  drawTrail(ctx, vp, match);
  if (input.banana) {
    drawBanana(ctx, vp, input.banana, (match.projectile?.t ?? 0) * 9);
  }
  drawImpact(ctx, vp, match);

  drawControlStrip(ctx, vp);
  if (input.touchHint !== null && match.phase === 'aiming' && !input.drag?.active) {
    drawTouchHint(ctx, vp, input.touchHint, shooter.facing, PLAYER_COLOR[match.current]);
  }
  if (input.drag?.active) drawPull(ctx, input.drag, match);
}

/**
 * Velo superior: la banda de indicadores es transparente y el cielo se ve
 * entero por detras. Lo que sostiene la legibilidad es este degradado, que se
 * desvanece hacia abajo en lugar de cortar con un borde recto.
 *
 * Un rectangulo opaco separaba el HUD del juego como dos pantallas pegadas; asi
 * es una sola escena con una sombra encima.
 */
function drawTopScrim(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  const bottom = vp.safeTop + GAUGES_BOTTOM + 34;
  const scrim = ctx.createLinearGradient(0, 0, 0, bottom);
  scrim.addColorStop(0, 'rgba(6, 10, 26, 0.82)');
  scrim.addColorStop(0.62, 'rgba(6, 10, 26, 0.46)');
  scrim.addColorStop(1, 'rgba(6, 10, 26, 0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, vp.cssWidth, bottom);
}

function polyline(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  points: ReadonlyArray<{ x: number; y: number }>,
): void {
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = toScreenX(vp, p.x);
    const y = toScreenY(vp, p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/**
 * Estela del tiro anterior de cada jugador. Es la mitad del bucle de
 * horquillado: sin ver por donde paso el ultimo, ajustar es adivinar.
 */
function drawGhosts(ctx: CanvasRenderingContext2D, vp: Viewport, match: Match): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 5]);
  for (const player of [0, 1] as const) {
    const ghost = match.players[player].ghost;
    if (!ghost || ghost.length < 2) continue;
    ctx.strokeStyle = PLAYER_COLOR[player];
    ctx.globalAlpha = player === match.current ? 0.4 : 0.16;
    polyline(ctx, vp, ghost);
  }
  ctx.restore();
}

/**
 * Arco de ayuda: solo el arranque de la parabola. El arco completo convertiria
 * el juego en apuntar a una linea y se cargaria el horquillado.
 */
function drawHint(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  hint: Array<{ x: number; y: number }>,
  current: 0 | 1,
): void {
  if (hint.length < 2) return;
  ctx.save();
  ctx.strokeStyle = PLAYER_COLOR[current];
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.setLineDash([1, 7]);
  polyline(ctx, vp, hint);
  ctx.restore();
}

/**
 * Recorrido de cada brazo durante un gesto, en 0..1.
 *
 * Los brazos van ALTERNOS: medio ciclo de desfase entre uno y otro. La
 * envolvente arranca y termina en reposo, porque sin ella apareceran ya
 * levantados de golpe al empezar el gesto.
 */
export function gestureArms(gesture: Gesture | null): {
  left: number;
  right: number;
  envelope: number;
} {
  if (gesture === null) return { left: 0, right: 0, envelope: 0 };

  const spec = GESTURE[gesture.kind];
  const progress = Math.max(0, Math.min(1, gesture.t / spec.duration));
  const envelope = Math.sin(Math.PI * progress);
  const swing = Math.cos(progress * Math.PI * 2 * spec.pumps);
  return {
    left: envelope * (0.5 - 0.5 * swing),
    right: envelope * (0.5 + 0.5 * swing),
    envelope,
  };
}

/**
 * Cuanto esta agachado, en 0..1.
 *
 * Baja de golpe y se levanta despacio: agacharse es un reflejo, incorporarse
 * es mirar si ha pasado el peligro.
 */
export function duckPose(elapsed: number | null): number {
  if (elapsed === null || elapsed < 0) return 0;
  const DOWN = 0.09;
  const HOLD = 0.68;
  if (elapsed < DOWN) return elapsed / DOWN;
  if (elapsed < HOLD) return 1;
  if (elapsed < DUCK_DURATION) return 1 - (elapsed - HOLD) / (DUCK_DURATION - HOLD);
  return 0;
}

/** Silueta dibujada, en unidades de mundo. La caja de golpeo debe cubrirla. */
export function gorillaSilhouette(): { halfWidth: number; height: number } {
  const headR = BODY_W * 0.24;
  return { halfWidth: BODY_W * 0.37, height: BODY_H * 0.8 + headR * 1.24 };
}

/**
 * Brazo de gorila: grueso en el hombro, afinando hasta la muñeca, y rematado
 * por un puño grande. Los nudillos desproporcionados son la mitad de la
 * silueta del bicho, y un rectangulo uniforme no los daba.
 */
function drawArm(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  angle: number,
  length: number,
  thickness: number,
  limb: string,
  fist: string,
  banana: boolean,
): void {
  const shoulderR = thickness * 0.5;
  const wristR = thickness * 0.33;
  const fistR = thickness * 0.52;

  ctx.save();
  ctx.translate(sx, sy);
  // El brazo se construye hacia +y; este giro alinea ese eje con `angle`.
  ctx.rotate(angle - Math.PI / 2);

  ctx.fillStyle = limb;
  ctx.beginPath();
  ctx.arc(0, 0, shoulderR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-shoulderR, 0);
  ctx.lineTo(-wristR, length);
  ctx.lineTo(wristR, length);
  ctx.lineTo(shoulderR, 0);
  ctx.closePath();
  ctx.fill();

  // El puño va en el tono claro: se lee como mano y no como mas brazo.
  ctx.fillStyle = fist;
  ctx.beginPath();
  ctx.arc(0, length, fistR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = limb;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * fistR * 0.42, length + fistR * 0.42, fistR * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  if (banana) drawHeldBanana(ctx, 0, length, fistR);
  ctx.restore();
}

/** Platano en la mano mientras apuntas: dice que ese brazo es el que lanza. */
function drawHeldBanana(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.3);
  ctx.quadraticCurveTo(0, -r * 1.15, r, r * 0.3);
  ctx.quadraticCurveTo(0, -r * 0.35, -r, r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Gorilas: torso de barril, hombros anchos que caen a caderas estrechas, brazos
 * largos y gruesos, y cabeza pequena metida entre los hombros con cresta
 * sagital y ceja marcada. Son los rasgos que separan un gorila de un mono
 * generico, y a este tamano se leen mejor que cualquier detalle fino.
 */
function drawGorillas(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  match: Match,
  time: number,
  gestures: readonly [Gesture | null, Gesture | null],
  ducks: readonly [number | null, number | null],
): void {
  for (const player of [0, 1] as const) {
    const state = match.players[player];
    const spot = rooftop(match.city, state.home);
    const cx = toScreenX(vp, spot.x);
    const base = toScreenY(vp, spot.y);
    const w = BODY_W * vp.scale;
    const h = BODY_H * vp.scale;
    const active = player === match.current && match.phase === 'aiming';

    const gesture = gestures[player];
    const { left: leftRaise, right: rightRaise, envelope } = gestureArms(gesture);
    const sweep = gesture ? GESTURE[gesture.kind].sweep : 0;

    let leftArm = Math.PI / 2 + REST_SPREAD + leftRaise * sweep;
    let rightArm = Math.PI / 2 - REST_SPREAD - rightRaise * sweep;

    // Fuera del "uh uh uh", el brazo de lanzar apunta a donde saldra el
    // platano: el gorila es tambien un indicador de punteria.
    if (active && gesture === null) {
      const aimAngle = toCanvasAngle(state.aim.angle, state.facing);
      if (state.facing === 1) rightArm = aimAngle;
      else leftArm = aimAngle;
    }

    const body = PLAYER_COLOR[player];
    const dark = PLAYER_DARK[player];
    const light = PLAYER_LIGHT[player];

    const shoulderY = base - h * 0.66;
    const shoulderHalf = w * 0.37;
    const hipHalf = w * 0.26;

    ctx.save();
    ctx.globalAlpha = active || gesture !== null ? 1 : 0.82;

    // Agacharse: se aplasta contra el tejado en lugar de moverse entero, que es
    // lo que hace que se lea como esquivar y no como bajar de altura.
    const duck = duckPose(ducks[player]);
    if (duck > 0) {
      ctx.translate(cx, base);
      ctx.scale(1 + 0.1 * duck, 1 - 0.32 * duck);
      ctx.translate(-cx, -base);
    }

    // Pies asomando bajo el torso: sin ellos el gorila flota sobre el tejado.
    ctx.fillStyle = dark;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * hipHalf * 0.72, base - h * 0.03, w * 0.15, h * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Brazos detras del torso: el bombeo se lee sin taparle la cara.
    const armed = active && gesture === null;
    const armLen = h * 0.56;
    const armThick = w * 0.25;
    drawArm(ctx, cx - shoulderHalf * 0.88, shoulderY, leftArm, armLen, armThick, dark, body,
      armed && state.facing === -1);
    drawArm(ctx, cx + shoulderHalf * 0.88, shoulderY, rightArm, armLen, armThick, dark, body,
      armed && state.facing === 1);

    // Torso: ancho arriba y estrecho abajo, que es la silueta del gorila.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderHalf, shoulderY);
    ctx.quadraticCurveTo(cx - shoulderHalf * 1.06, base, cx - hipHalf, base);
    ctx.lineTo(cx + hipHalf, base);
    ctx.quadraticCurveTo(cx + shoulderHalf * 1.06, base, cx + shoulderHalf, shoulderY);
    ctx.quadraticCurveTo(cx, shoulderY - h * 0.12, cx - shoulderHalf, shoulderY);
    ctx.closePath();
    ctx.fill();

    // Silla plateada del lomo: la marca del macho adulto.
    ctx.fillStyle = light;
    ctx.globalAlpha *= 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, shoulderY + h * 0.08, shoulderHalf * 0.78, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = active || gesture !== null ? 1 : 0.82;

    // Pecho.
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(cx, base - h * 0.24, w * 0.17, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cabeza: pequena y hundida entre los hombros, sin cuello visible.
    const headY = shoulderY - h * 0.14;
    const headR = w * 0.24;

    ctx.fillStyle = dark;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * headR * 1.02, headY, w * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Cresta sagital: la cupula del craneo.
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.82, headR * 0.62, headR * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ceja pronunciada.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.roundRect(cx - headR * 0.86, headY - headR * 0.5, headR * 1.72, headR * 0.3, headR * 0.15);
    ctx.fill();

    // Hocico ancho y achatado.
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.ellipse(cx, headY + headR * 0.42, headR * 0.78, headR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ojos. Al gritar se cierran, que es la mitad de la gracia del gesto.
    ctx.fillStyle = '#14203c';
    const eyeY = headY - headR * 0.08;
    for (const side of [-1, 1]) {
      const ex = cx + side * headR * 0.4;
      if (envelope > 0.5 && gesture?.kind === 'hoot') {
        ctx.beginPath();
        ctx.roundRect(ex - headR * 0.2, eyeY - headR * 0.05, headR * 0.4, headR * 0.1, headR * 0.05);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(ex, eyeY, headR * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fosas nasales, muy separadas y bajas.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(
        cx + side * headR * 0.24,
        headY + headR * 0.42,
        headR * 0.1,
        headR * 0.07,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();

    // Bien despegada de la cabeza: pegada al craneo parecia parte del gorila.
    if (active) drawTurnMarker(ctx, cx, base - h * 1.52, time, PLAYER_COLOR[player]);
  }
}

function drawTurnMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  time: number,
  color: string,
): void {
  const bob = Math.sin(time * 4) * 3;
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, y + 9 + bob);
  ctx.lineTo(cx - 6, y + bob);
  ctx.lineTo(cx + 6, y + bob);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, vp: Viewport, match: Match): void {
  if (match.phase !== 'flying' || match.trail.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#ffe066';
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  polyline(ctx, vp, match.trail);
  ctx.restore();
}

/** Media luna girando. Un circulo amarillo no es un platano. */
function drawBanana(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  banana: { x: number; y: number },
  spin: number,
): void {
  const r = BANANA_R * vp.scale;
  ctx.save();
  ctx.translate(toScreenX(vp, banana.x), toScreenY(vp, banana.y));
  ctx.rotate(spin);

  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.34);
  ctx.quadraticCurveTo(0, -r * 1.3, r, r * 0.34);
  ctx.quadraticCurveTo(0, -r * 0.4, -r, r * 0.34);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#7c5f18';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r, r * 0.34, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawImpact(ctx: CanvasRenderingContext2D, vp: Viewport, match: Match): void {
  const impact = match.impact;
  if (!impact || match.phase !== 'impact') return;

  const progress = Math.min(1, impact.t / 0.4);
  const radius = (2 + progress * 6) * vp.scale;
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.fillStyle = impact.hit !== null ? '#ff6b6b' : '#ffb84d';
  ctx.beginPath();
  ctx.arc(toScreenX(vp, impact.x), toScreenY(vp, impact.y), radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawControlStrip(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  ctx.fillStyle = STRIP;
  ctx.fillRect(0, vp.groundY, vp.cssWidth, vp.stripHeight);
  ctx.strokeStyle = STRIP_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, vp.groundY + 0.5);
  ctx.lineTo(vp.cssWidth, vp.groundY + 0.5);
  ctx.stroke();
}

/**
 * Indicador de tension bajo el dedo. El anillo marca donde acaba el tramo
 * grueso: cruzarlo es la senal visible de que has entrado en modo fino.
 */
function drawPull(ctx: CanvasRenderingContext2D, drag: DragInfo, match: Match): void {
  const power = match.players[match.current].aim.power;
  const color = powerColor(power);
  ctx.save();

  ctx.strokeStyle = color;
  ctx.globalAlpha = drag.fine ? 0.5 : 0.25;
  ctx.lineWidth = drag.fine ? 2 : 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(drag.anchorX, drag.anchorY, PULL_COARSE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(drag.anchorX, drag.anchorY);
  ctx.lineTo(drag.curX, drag.curY);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(drag.curX, drag.curY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Duracion de un ciclo de la demo del gesto, en segundos. */
export const TOUCH_HINT_LOOP = 2.6;

/**
 * Demo del gesto en la franja de abajo.
 *
 * Sin botones ni etiquetas, nada indica que se tira desde ahi: un jugador nuevo
 * se queda mirando la pantalla. Esto lo enseña en vez de explicarlo, y
 * desaparece en cuanto arrastra por primera vez.
 */
function drawTouchHint(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  elapsed: number,
  facing: 1 | -1,
  color: string,
): void {
  const t = (elapsed % TOUCH_HINT_LOOP) / TOUCH_HINT_LOOP;
  const ax = vp.cssWidth / 2;
  const ay = vp.groundY + vp.stripHeight * 0.2;
  // Se tensa hacia atras: al contrario de donde mira el gorila.
  const reach = 104;
  const dx = -facing * reach * 0.62;
  const dy = reach * 0.78;

  // 0-55% tensa, 55-64% suelta, resto pausa antes de repetir.
  const PULL_END = 0.55;
  const SNAP_END = 0.64;
  let progress: number;
  let alpha: number;
  if (t < PULL_END) {
    const k = t / PULL_END;
    progress = 1 - Math.pow(1 - k, 2);
    alpha = Math.min(1, k * 4);
  } else if (t < SNAP_END) {
    progress = 1 - (t - PULL_END) / (SNAP_END - PULL_END);
    alpha = 1;
  } else {
    progress = 0;
    alpha = Math.max(0, 1 - (t - SNAP_END) / (1 - SNAP_END));
  }

  const fx = ax + dx * progress;
  const fy = ay + dy * progress;

  ctx.save();
  ctx.globalAlpha = alpha * 0.9;

  ctx.strokeStyle = color;
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath();
  ctx.arc(ax, ay, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (progress > 0.02) {
    ctx.globalAlpha = alpha * 0.6;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(fx, fy);
    ctx.stroke();
  }

  // El dedo: circulo relleno con halo, para que se lea como contacto y no como
  // un punto de la interfaz.
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(fx, fy, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.95;
  ctx.beginPath();
  ctx.arc(fx, fy, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.75;
  ctx.fillStyle = '#8d9bc0';
  ctx.textAlign = 'center';
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('Arrastra desde aquí y suelta', ax, vp.groundY + vp.stripHeight * 0.72);
  ctx.restore();
}
