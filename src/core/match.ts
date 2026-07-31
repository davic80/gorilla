/**
 * Maquina de estados de la partida: turnos, viento, impactos y marcador.
 *
 * Puro y determinista. No toca DOM ni canvas: la misma funcion que mueve la
 * partida en pantalla la puede correr la IA en F3 para resolver un tiro.
 */

import { generateCity, rooftop, type City } from './city';
import { PLAY_HEIGHT, WORLD_WIDTH } from './constants';
import { isSpent, launch, stepProjectile, type Projectile } from './physics';
import { Rng } from './rng';
import { Terrain, type DirtyRect } from './terrain';

export type Phase = 'aiming' | 'flying' | 'impact' | 'roundOver' | 'matchOver';

/**
 * Caja de golpeo, en unidades de mundo. Tiene que cubrir la silueta DIBUJADA:
 * si el platano atraviesa una cabeza que se ve en pantalla y no pasa nada, el
 * juego parece roto. `scene.test.ts` ata estos numeros al dibujo para que un
 * cambio de arte no vuelva a desincronizarlos en silencio.
 */
export const HIT_W = 5.8;
export const HIT_H = 8.8;

export const EXPLOSION_R = 3.5;
/**
 * El alcance del estallido se mide contra la SUPERFICIE del cuerpo, no contra
 * un punto central. Medirlo al centro hacia que un platano caido a los pies
 * quedara fuera de rango mientras uno a la altura del pecho, a la misma
 * distancia real, si mataba.
 */
export const NEAR_MISS_R = 6.5;

export const ANGLE_MIN = -20;
export const ANGLE_MAX = 100;

/** Pausa tras el impacto antes de pasar el turno, en segundos. */
const IMPACT_HOLD = 0.65;

export interface Aim {
  angle: number;
  power: number;
}

export interface PlayerState {
  /** Punteria persistente: cada turno arranca donde lo dejaste. Es la base del */
  /** bucle de horquillado, y lo que el original de 1991 no hacia.              */
  aim: Aim;
  score: number;
  home: number;
  facing: 1 | -1;
  /**
   * Punteria del ultimo tiro lanzado. Se marca en los indicadores para que se
   * vea de donde vienes: sin botones de ajuste, esta referencia visual es lo
   * que mantiene vivo el bucle de horquillado.
   */
  lastShot: Aim | null;
  /** Estela del ultimo tiro, para dibujar el fantasma. */
  ghost: Array<{ x: number; y: number }> | null;
}

export interface Impact {
  x: number;
  y: number;
  /** Tiempo transcurrido desde el estallido. */
  t: number;
  hit: 0 | 1 | null;
  nearMiss: boolean;
}

export interface Match {
  seed: number;
  city: City;
  terrain: Terrain;
  wind: number;
  phase: Phase;
  current: 0 | 1;
  players: [PlayerState, PlayerState];
  projectile: Projectile | null;
  trail: Array<{ x: number; y: number }>;
  impact: Impact | null;
  /** Puntos para ganar la partida. */
  target: number;
  round: number;
  /** Turnos jugados en la ronda. El viento se deriva de aqui, no de un Rng */
  /** vivo, para que la partida siga siendo reproducible desde la semilla.  */
  turn: number;
  /** El proyectil aun no ha salido de la caja del lanzador. */
  armed: boolean;
  /** Region que abrio la ultima explosion, para que el render repinte solo eso. */
  lastCarve: DirtyRect | null;
}

function newPlayer(home: number, facing: 1 | -1, score = 0): PlayerState {
  return { aim: { angle: 45, power: 60 }, score, home, facing, ghost: null, lastShot: null };
}

/**
 * Viento del turno. Mismo rango y misma cola larga de rachas extremas que el
 * original de 1991: es la aleatoriedad justa que impide memorizar tiros y le da
 * coartada al que pierde.
 */
export function rollWind(rng: Rng): number {
  // La base sube de +-5 a +-7 y la racha se recorta de 3x a 2,2x: la banda
  // habitual pasa de 1-4 a 1-5,5 sin mover el techo (~15), que ya era el
  // extremo raro que hace memorable un turno.
  let wind = rng.range(-7, 7);
  if (rng.bool(1 / 3)) wind *= rng.range(1, 2.2);
  return wind;
}

/** Viento derivado de (semilla, turno): cambia cada turno sin romper la semilla. */
export function windForTurn(seed: number, turn: number): number {
  return rollWind(new Rng((seed ^ Math.imul(turn + 1, 2654435761)) >>> 0));
}

export function createMatch(seed: number, target = 3): Match {
  const rng = new Rng(seed);
  const city = generateCity(rng);
  return {
    seed,
    city,
    terrain: Terrain.fromCity(city),
    wind: windForTurn(seed, 0),
    phase: 'aiming',
    current: 0,
    players: [newPlayer(city.homeA, 1), newPlayer(city.homeB, -1)],
    projectile: null,
    trail: [],
    impact: null,
    target,
    round: 1,
    turn: 0,
    armed: false,
    lastCarve: null,
  };
}

/** Ciudad nueva conservando el marcador. El turno lo abre quien encajo. */
export function nextRound(match: Match, perdedor: 0 | 1): Match {
  const seed = (Math.imul(match.seed, 1664525) + 1013904223 + match.round) >>> 0;
  const city = generateCity(new Rng(seed));
  const [a, b] = match.players;

  return {
    ...match,
    seed,
    city,
    terrain: Terrain.fromCity(city),
    wind: windForTurn(seed, 0),
    phase: 'aiming',
    current: perdedor,
    players: [newPlayer(city.homeA, 1, a.score), newPlayer(city.homeB, -1, b.score)],
    projectile: null,
    trail: [],
    impact: null,
    round: match.round + 1,
    turn: 0,
    armed: false,
    lastCarve: null,
  };
}

/** Punto de salida del platano: la mano del gorila, ya fuera de su silueta. */
export function launchPoint(match: Match, player: 0 | 1): { x: number; y: number } {
  const p = match.players[player];
  const spot = rooftop(match.city, p.home);
  return { x: spot.x + p.facing * (HIT_W / 2 + 0.5), y: spot.y + HIT_H };
}

export function hitBox(match: Match, player: 0 | 1) {
  const p = match.players[player];
  const spot = rooftop(match.city, p.home);
  return {
    x0: spot.x - HIT_W / 2,
    x1: spot.x + HIT_W / 2,
    y0: spot.y,
    y1: spot.y + HIT_H,
  };
}

function insideBox(box: ReturnType<typeof hitBox>, x: number, y: number): boolean {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

/** Distancia de un punto a la caja del gorila. Cero si esta dentro. */
export function distanceToGorilla(match: Match, player: 0 | 1, x: number, y: number): number {
  const box = hitBox(match, player);
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dy = Math.max(box.y0 - y, 0, y - box.y1);
  return Math.hypot(dx, dy);
}

export function clampAim(aim: Aim): Aim {
  return {
    angle: Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, aim.angle)),
    power: Math.max(0, Math.min(100, aim.power)),
  };
}

export function fire(match: Match): void {
  if (match.phase !== 'aiming') return;
  const shooter = match.players[match.current];
  const from = launchPoint(match, match.current);

  shooter.lastShot = { ...shooter.aim };
  match.projectile = launch(from.x, from.y, shooter.aim.angle, shooter.aim.power, shooter.facing);
  match.trail = [{ x: from.x, y: from.y }];
  match.phase = 'flying';
  match.armed = false;
  match.impact = null;
}

/** Simula la trayectoria sin tocar la partida: sirve al arco de ayuda y a la IA. */
export function previewTrajectory(
  match: Match,
  aim: Aim,
  player: 0 | 1,
  seconds: number,
  dt: number,
): Array<{ x: number; y: number }> {
  const p = match.players[player];
  const from = launchPoint(match, player);
  const shot = launch(from.x, from.y, aim.angle, aim.power, p.facing);
  const points: Array<{ x: number; y: number }> = [{ x: shot.x, y: shot.y }];

  const steps = Math.ceil(seconds / dt);
  for (let i = 0; i < steps; i++) {
    stepProjectile(shot, match.wind, dt);
    points.push({ x: shot.x, y: shot.y });
    if (match.terrain.solidAt(shot.x, shot.y)) break;
  }
  return points;
}

function detonate(match: Match, x: number, y: number): void {
  match.lastCarve = match.terrain.carve(x, y, EXPLOSION_R);

  let hit: 0 | 1 | null = null;
  let nearMiss = false;

  for (const player of [0, 1] as const) {
    const dist = distanceToGorilla(match, player, x, y);
    // Si la onda alcanza el cuerpo, mata. Es una regla que se explica sola.
    if (dist <= EXPLOSION_R) hit = player;
    else if (dist <= NEAR_MISS_R) nearMiss = true;
  }

  match.impact = { x, y, t: 0, hit, nearMiss };
  match.phase = 'impact';
  match.projectile = null;
}

/** Avanza la partida un paso fijo. */
export function stepMatch(match: Match, dt: number): void {
  if (match.phase === 'impact') {
    const impact = match.impact;
    if (!impact) return;
    impact.t += dt;
    if (impact.t >= IMPACT_HOLD) resolveImpact(match, impact);
    return;
  }

  if (match.phase !== 'flying' || !match.projectile) return;

  const p = match.projectile;
  const x0 = p.x;
  const y0 = p.y;
  stepProjectile(p, match.wind, dt);
  match.trail.push({ x: p.x, y: p.y });

  const thrower = hitBox(match, match.current);
  if (!match.armed && !insideBox(thrower, p.x, p.y)) match.armed = true;

  // Objetivo primero: un platano que roza la esquina de un tejado y toca al
  // gorila detras debe contar como acierto, no como impacto en el edificio.
  for (const player of [0, 1] as const) {
    if (player === match.current && !match.armed) continue;
    const box = hitBox(match, player);
    if (insideBox(box, p.x, p.y)) {
      detonate(match, p.x, p.y);
      return;
    }
  }

  const ground = match.terrain.traceSegment(x0, y0, p.x, p.y);
  if (ground) {
    detonate(match, ground.x, ground.y);
    return;
  }

  const fuera = p.x < -15 || p.x > WORLD_WIDTH + 15;
  const perdido = p.y > PLAY_HEIGHT * 3;
  if (fuera || perdido || isSpent(p)) {
    match.players[match.current].ghost = match.trail.slice();
    match.projectile = null;
    match.impact = null;
    passTurn(match);
  }
}

function resolveImpact(match: Match, impact: Impact): void {
  match.players[match.current].ghost = match.trail.slice();

  if (impact.hit !== null) {
    const ganador = impact.hit === 0 ? 1 : 0;
    match.players[ganador].score += 1;
    match.phase = match.players[ganador].score >= match.target ? 'matchOver' : 'roundOver';
    return;
  }
  passTurn(match);
}

function passTurn(match: Match): void {
  match.current = match.current === 0 ? 1 : 0;
  match.turn += 1;
  match.wind = windForTurn(match.seed, match.turn);
  match.phase = 'aiming';
  match.trail = [];
  match.armed = false;
}
