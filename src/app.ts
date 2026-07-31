/**
 * F1: el vertical slice. Dos jugadores por turnos en el mismo movil, terreno
 * destruible y control 100% tactil.
 *
 * No hay ni un boton: se tensa arrastrando desde la franja baja, se lanza al
 * soltar, se cancela tocando con un segundo dedo y se pasa de ronda tocando la
 * pantalla.
 */

import { Sfx, unlockAudio } from './audio/sfx';
import {
  ASSIST_SECONDS,
  PLAY_HEIGHT,
  RULES_VERSION,
  WORLD_WIDTH,
  type AssistLevel,
} from './core/constants';
import { FIXED_STEP, FixedStepClock } from './core/loop';
import {
  clampAim,
  createMatch,
  distanceToGorilla,
  fire,
  nextRound,
  previewTrajectory,
  stepMatch,
  type Match,
  type Phase,
} from './core/match';
import { interpolate } from './core/physics';
import { AimController } from './input/aim';
import { Feedback } from './input/feedback';
import { createStage, syncStageSize } from './render/canvas';
import { DUCK_DURATION, GESTURE, drawScene, type Gesture, type GestureKind } from './render/scene';
import { TerrainLayer } from './render/terrainLayer';
import { computeViewport, readSafeInset, type Viewport } from './render/viewport';
import { buildSky, cloudDriftStep, type Sky } from './render/sky';
import { buildWindows, type CityWindow } from './render/windows';
import { Hud } from './ui/hud';

/** Multiplicador al mantener el dedo durante el vuelo. Ver una parabola */
/** perdida entera es lo que mas mata el ritmo en movil.                  */
const FAST_FORWARD = 3;

/** Duracion del destello de tick, en segundos. */
const GLOW_TIME = 0.09;

/**
 * El gesto empieza en la linea de suelo o por debajo, nunca mas arriba: tensar
 * desde el medio de la pantalla pondria la mano encima de la ciudad y de la
 * trayectoria justo mientras apuntas.
 */
const DRAG_ZONE_TOP = 0;

const ASSIST_ORDER: readonly AssistLevel[] = ['novato', 'normal', 'leyenda'];

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Falta #stage en el documento');

const stage = createStage(canvas);
const clock = new FixedStepClock();
const feedback = new Feedback();
const sfx = new Sfx();

let assist: AssistLevel = 'normal';
let muted = false;

const hud = new Hud({
  onToggleMute: () => {
    muted = !muted;
    sfx.setMuted(muted);
    feedback.setMuted(muted);
    hud.setMuted(muted);
    unlockAudio();
  },
  onCycleAssist: () => {
    assist = ASSIST_ORDER[(ASSIST_ORDER.indexOf(assist) + 1) % ASSIST_ORDER.length]!;
    hud.setAssist(assist);
  },
});

let match: Match = createMatch(initialSeed());
let terrainLayer = new TerrainLayer(match.terrain);
let windows: CityWindow[] = buildWindows(match.city);
let sky: Sky = buildSky(match.city);
let viewport: Viewport = computeViewport(1, 1, 1, WORLD_WIDTH, PLAY_HEIGHT);
let previousPhase: Phase = match.phase;
let fine = false;
let boosting = false;
let time = 0;
let lastTime = performance.now() / 1000;

// La demo del gesto se apaga en cuanto el jugador arrastra por primera vez: ya
// no hay nada que enseñar.
let touchHint: number | null = 0;

// Deriva acumulada del cielo. Se integra frame a frame en vez de derivarse del
// reloj porque el viento cambia cada turno: multiplicar por el tiempo total
// haria saltar las nubes en cada cambio.
let cloudDrift = 0;

// Los gestos son adorno: usan Math.random a proposito, porque no deben entrar
// en el flujo determinista que reproduce una partida desde su semilla.
let gestures: [Gesture | null, Gesture | null] = [null, null];
let ducks: [number | null, number | null] = [null, null];
/** Quien ya se ha agachado en el tiro en curso: uno por platano, no mas. */
let ducked: [boolean, boolean] = [false, false];

/** Segundos sin que nadie apunte antes de que los gorilas se impacienten. */
let idle = 0;
let nextBeat = beatGap();

function beatGap(): number {
  return 9 + Math.random() * 6;
}

/**
 * A que distancia del cuerpo se agacha un gorila.
 *
 * Mayor que el radio del estallido (3,5): tiene que reaccionar a lo que va a
 * fallar por poco, no a lo que ya le ha dado.
 */
const DUCK_RADIUS = 7.5;

function initialSeed(): number {
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get('seed');
  const parsed = fromUrl ? Number.parseInt(fromUrl, 10) : Number.NaN;
  // Unico punto con aleatoriedad real: a partir de aqui todo sale del Rng.
  return Number.isFinite(parsed) ? parsed >>> 0 : (Math.random() * 4294967296) >>> 0;
}

function publishSeed(): void {
  location.hash = `seed=${match.seed}&v=${RULES_VERSION}`;
}

/** Fin de ronda o de partida: se avanza tocando, sin boton. */
function advance(): void {
  match =
    match.phase === 'matchOver'
      ? createMatch((Math.random() * 4294967296) >>> 0, match.target)
      : nextRound(match, match.impact?.hit ?? 0);
  terrainLayer = new TerrainLayer(match.terrain);
  windows = buildWindows(match.city);
  sky = buildSky(match.city);
  previousPhase = match.phase;
  publishSeed();
}

function startGesture(player: 0 | 1, kind: GestureKind): void {
  if (gestures[player] !== null) return;
  gestures[player] = { kind, t: 0 };

  // El sonido cae en el punto alto de cada brazada, no al arrancar el ciclo:
  // por eso el desfase de medio periodo.
  const spec = GESTURE[kind];
  const spacing = spec.duration / spec.pumps;
  if (kind === 'hoot') sfx.taunt(spacing, spacing / 2);
  else sfx.chestBeat(spacing, spacing / 2);
}

function updateGestures(delta: number): void {
  for (const player of [0, 1] as const) {
    const gesture = gestures[player];
    if (gesture === null) continue;
    const t = gesture.t + delta;
    gestures[player] = t >= GESTURE[gesture.kind].duration ? null : { kind: gesture.kind, t };
  }

  for (const player of [0, 1] as const) {
    const duck = ducks[player];
    if (duck === null) continue;
    const t = duck + delta;
    ducks[player] = t >= DUCK_DURATION ? null : t;
  }

  // Si nadie apunta durante mucho rato, los gorilas se impacientan.
  if (match.phase === 'aiming' && aim.current === null) idle += delta;
  else idle = 0;

  if (idle >= nextBeat) {
    idle = 0;
    nextBeat = beatGap();
    startGesture(Math.random() < 0.5 ? 0 : 1, 'chest');
  }
}

/**
 * Un platano que va a pasar rozando hace que el gorila se agache. Es la
 * respuesta honesta a un fallo por poco: antes, un tiro milimetrico se
 * quedaba en nada visible.
 */
function checkDucks(): void {
  if (match.phase !== 'flying' || !match.projectile) return;
  const { x, y } = match.projectile;

  for (const player of [0, 1] as const) {
    if (ducked[player]) continue;
    // Nadie se agacha de su propio platano hasta que este de verdad en vuelo.
    if (player === match.current && !match.armed) continue;
    if (distanceToGorilla(match, player, x, y) > DUCK_RADIUS) continue;

    ducked[player] = true;
    ducks[player] = 0;
    sfx.duck();
  }
}

/** Sonido y celebracion en los cambios de fase, no en cada frame. */
function reactToPhase(): void {
  if (match.phase === previousPhase) return;

  if (match.phase === 'impact' && match.impact) {
    if (match.impact.hit !== null) {
      sfx.explosion(true);
      sfx.cheer();
    } else {
      sfx.thud();
    }
  }

  // Se rie quien se agacho y salio vivo. La risa va detras del estallido, no
  // encima.
  if (previousPhase === 'flying' && match.phase !== 'flying') {
    for (const player of [0, 1] as const) {
      if (ducked[player] && match.impact?.hit !== player) sfx.laugh(0.4);
    }
    ducked = [false, false];
  }

  if (match.phase === 'roundOver' || match.phase === 'matchOver') {
    const ganador = match.impact?.hit === 0 ? 1 : 0;
    startGesture(ganador, 'hoot');
  }

  previousPhase = match.phase;
}

const aim = new AimController(canvas, {
  enabled: () => match.phase === 'aiming',
  canStartAt: (_x, y) => y >= viewport.groundY - DRAG_ZONE_TOP,
  facing: () => match.players[match.current].facing,
  onAim: (next, drag) => {
    touchHint = null;
    match.players[match.current].aim = clampAim(next);
    fine = drag.fine;
    feedback.aimTick(next.angle, next.power, drag.fine);
  },
  onFire: (next) => {
    match.players[match.current].aim = clampAim(next);
    fine = false;
    feedback.resetTicks();
    sfx.whoosh(next.power);
    fire(match);
  },
  onCancel: () => {
    fine = false;
    feedback.resetTicks();
  },
});

/**
 * `?diag=1` muestra que canales de respuesta hay vivos en este aparato. Es la
 * unica forma de saber por que no vibra un movil que no tengo delante.
 */
const diagnostics = new URLSearchParams(location.search).get('diag') === '1';

function reportDiagnostics(): void {
  const c = feedback.channels();
  hud.showDiagnostics(
    [
      `vibrate API  ${c.vibrate ? 'si' : 'NO'}`,
      `switch iOS   ${c.iosSwitch ? 'si' : 'NO'}`,
      `audio        ${c.audio ? 'si' : 'NO'}`,
      `ultimo tick  ${(performance.now() / 1000 - feedback.lastTick).toFixed(1)}s`,
      navigator.userAgent,
    ].join('\n'),
  );
}

canvas.addEventListener('pointerdown', () => {
  // Audio y haptico exigen un gesto del usuario; vale el primer toque, sea cual
  // sea, incluido el que solo sirve para pasar de ronda.
  unlockAudio();
  feedback.unlock();

  if (match.phase === 'flying') boosting = true;
  else if (match.phase === 'roundOver' || match.phase === 'matchOver') advance();
});
addEventListener('pointerup', () => {
  boosting = false;
});
addEventListener('pointercancel', () => {
  boosting = false;
});

function refreshViewport(): void {
  const root = document.documentElement;
  viewport = computeViewport(
    stage.cssWidth,
    stage.cssHeight,
    stage.dpr,
    WORLD_WIDTH,
    PLAY_HEIGHT,
    readSafeInset(root, '--safe-bottom'),
    readSafeInset(root, '--safe-top'),
  );
  hud.setLayout(viewport.hudBandHeight);
}

function render(alpha: number, glow: number): void {
  const player = match.players[match.current];
  const seconds = ASSIST_SECONDS[assist];
  const hint =
    match.phase === 'aiming' && seconds > 0
      ? previewTrajectory(match, player.aim, match.current, seconds, FIXED_STEP)
      : [];

  drawScene(stage.ctx, viewport, {
    match,
    terrainLayer,
    sky,
    windows,
    banana: match.projectile ? interpolate(match.projectile, alpha) : null,
    drag: aim.current,
    hint,
    glow,
    fine,
    gestures,
    ducks,
    touchHint,
    cloudDrift,
    time,
  });
}

function frame(now: number): void {
  const seconds = now / 1000;
  const delta = seconds - lastTime;
  lastTime = seconds;

  if (syncStageSize(stage)) refreshViewport();

  // En apaisado la pantalla la tapa el aviso de girar: no tiene sentido seguir
  // simulando una partida que nadie ve, y menos resolver un vuelo a ciegas.
  if (stage.cssWidth > stage.cssHeight) {
    requestAnimationFrame(frame);
    return;
  }

  time += delta;
  const tick = clock.tick(delta);
  const speed = boosting && match.phase === 'flying' ? FAST_FORWARD : 1;
  for (let i = 0; i < tick.steps * speed; i++) stepMatch(match, FIXED_STEP);

  checkDucks();
  reactToPhase();
  updateGestures(delta);
  if (touchHint !== null) touchHint += delta;
  cloudDrift += cloudDriftStep(match.wind, delta);

  // El terreno visual se reconstruye desde la mascara, y solo donde cambio.
  if (match.lastCarve) {
    terrainLayer.sync(match.lastCarve);
    match.lastCarve = null;
  }

  const tickAge = seconds - feedback.lastTick;
  render(tick.alpha, tickAge < GLOW_TIME ? 1 - tickAge / GLOW_TIME : 0);
  hud.update(match);
  if (diagnostics) reportDiagnostics();
  requestAnimationFrame(frame);
}

// Los chips arrancan reflejando el estado real, sin anunciar nada.
hud.setMuted(muted);
hud.setAssist(assist, false);

publishSeed();
syncStageSize(stage);
refreshViewport();
requestAnimationFrame(frame);
