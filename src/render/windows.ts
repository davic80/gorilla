/**
 * Ventanas de los edificios.
 *
 * Puramente decorativas, generadas desde `decorSeed` y no desde el RNG de
 * simulacion: anadir o quitar detalle visual nunca desplaza la generacion de la
 * ciudad ni rompe una semilla compartida.
 *
 * Se dibujan encima del terreno comprobando la mascara: cuando una explosion se
 * come esa parte del edificio, sus ventanas desaparecen solas.
 */

import type { City } from '../core/city';
import type { Terrain } from '../core/terrain';
import { Rng } from '../core/rng';
import type { Viewport } from './viewport';
import { toScreenX, toScreenY } from './viewport';

type WindowKind = 'on' | 'off' | 'blink' | 'toggle';

export interface CityWindow {
  x: number;
  y: number;
  kind: WindowKind;
  /** Segundos del ciclo completo. Largos: esto es una ciudad, no una discoteca. */
  period: number;
  /** Desfase propio, para que no haya dos ventanas sincronizadas. */
  phase: number;
  /** Fraccion del ciclo que pasa encendida. Propia de cada ventana. */
  duty: number;
}

const WIN_W = 1.2;
const WIN_H = 1.6;
const STEP_X = 2.6;
const STEP_Y = 3.3;
const INSET_X = 1.5;
const INSET_TOP = 2.4;
const BASE_Y = 1.8;

const LIT = '#ffd98a';
const DARK = '#11162e';

export function buildWindows(city: City): CityWindow[] {
  const windows: CityWindow[] = [];

  // Cada ciudad tiene su propio caracter: hay noches muertas y noches con algo
  // de movimiento. La inmensa mayoria de ventanas se queda fija siempre.
  const cityRng = new Rng((city.seed ^ 0x9e3779b9) >>> 0);
  const liveliness = cityRng.range(0.02, 0.08);
  const litShare = cityRng.range(0.28, 0.5);

  for (const b of city.buildings) {
    const rng = new Rng(b.decorSeed);
    const right = b.x + b.width - INSET_X - WIN_W;
    const top = b.height - INSET_TOP - WIN_H;

    for (let x = b.x + INSET_X; x <= right; x += STEP_X) {
      for (let y = BASE_Y; y <= top; y += STEP_Y) {
        const roll = rng.next();
        const kind: WindowKind =
          roll < liveliness * 0.45
            ? 'blink'
            : roll < liveliness
              ? 'toggle'
              : roll < liveliness + litShare
                ? 'on'
                : 'off';

        windows.push({
          x,
          y,
          kind,
          // Periodos muy largos y bien dispersos. Un cambio de luz tiene que
          // sorprenderte de reojo entre turno y turno, nunca competir con la
          // trayectoria, que es lo que hay que mirar.
          period: kind === 'blink' ? rng.range(14, 38) : rng.range(90, 240),
          phase: rng.next(),
          duty: rng.range(0.25, 0.7),
        });
      }
    }
  }

  return windows;
}

export function isLit(win: CityWindow, time: number): boolean {
  switch (win.kind) {
    // Fijas: la enorme mayoria de la ciudad.
    case 'on':
      return true;
    case 'off':
      return false;
    // Las que cambian: cada una con su periodo, su desfase y su proporcion de
    // encendido, para que no se lea ningun patron.
    case 'blink':
    case 'toggle':
      return (time / win.period + win.phase) % 1 < win.duty;
  }
}

export function drawWindows(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  terrain: Terrain,
  windows: readonly CityWindow[],
  time: number,
): void {
  const w = WIN_W * vp.scale;
  const h = WIN_H * vp.scale;

  // Dos trazados y dos rellenos para toda la ciudad: agrupar por color evita
  // cientos de cambios de estado del contexto por frame.
  ctx.beginPath();
  let anyLit = false;
  const dark: CityWindow[] = [];

  for (const win of windows) {
    // Si la explosion se comio ese trozo de edificio, la ventana ya no existe.
    if (!terrain.solidAt(win.x + WIN_W / 2, win.y + WIN_H / 2)) continue;

    if (isLit(win, time)) {
      ctx.rect(toScreenX(vp, win.x), toScreenY(vp, win.y + WIN_H), w, h);
      anyLit = true;
    } else {
      dark.push(win);
    }
  }

  if (anyLit) {
    ctx.fillStyle = LIT;
    ctx.fill();
  }

  if (dark.length > 0) {
    ctx.beginPath();
    for (const win of dark) {
      ctx.rect(toScreenX(vp, win.x), toScreenY(vp, win.y + WIN_H), w, h);
    }
    ctx.fillStyle = DARK;
    ctx.fill();
  }
}
