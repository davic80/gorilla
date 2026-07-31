/**
 * Generacion procedural del skyline. Puro y determinista: misma semilla, misma
 * ciudad, en cualquier dispositivo.
 *
 * Hereda del original de 1991 la idea de los cuatro patrones de pendiente, que
 * es lo que hace que cada partida se sienta como un escenario distinto y no
 * como ruido aleatorio.
 */

import { CITY, WORLD_WIDTH } from './constants';
import type { Rng } from './rng';

export type SlopeKind = 'up' | 'down' | 'valley' | 'peak';

export const SLOPE_KINDS: readonly SlopeKind[] = ['up', 'down', 'valley', 'peak'];

export interface Building {
  /** Borde izquierdo en unidades de mundo. */
  x: number;
  width: number;
  height: number;
  /**
   * Semilla decorativa (ventanas, antenas). Desacopla el render del flujo del
   * RNG de simulacion: anadir detalle visual nunca desplaza la generacion.
   */
  decorSeed: number;
}

export interface City {
  seed: number;
  slope: SlopeKind;
  buildings: Building[];
  /** Indice del edificio de cada gorila. */
  homeA: number;
  homeB: number;
}

/** Perfil de altura normalizado en [0,1] segun la pendiente elegida. */
function slopeProfile(kind: SlopeKind, t: number): number {
  switch (kind) {
    case 'up':
      return t;
    case 'down':
      return 1 - t;
    // Torres altas en los extremos, hundido en el centro: tiros tensos.
    case 'valley':
      return Math.abs(2 * t - 1);
    // Rascacielos central: obliga a bombear por encima. Es el que mejor llena
    // el encuadre vertical del movil.
    case 'peak':
      return 1 - Math.abs(2 * t - 1);
  }
}

export function generateCity(rng: Rng): City {
  const seed = rng.seed;
  const count = rng.int(CITY.minBuildings, CITY.maxBuildings);
  const slope = rng.pick(SLOPE_KINDS);

  // Anchos crudos normalizados para cubrir el mundo exactamente. Normalizar en
  // vez de recortar evita el hueco final que tenia el original.
  const raw: number[] = [];
  let rawTotal = 0;
  for (let i = 0; i < count; i++) {
    const w = rng.range(CITY.minWidth, CITY.maxWidth);
    raw.push(w);
    rawTotal += w;
  }

  const buildings: Building[] = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const width = (raw[i]! / rawTotal) * WORLD_WIDTH;
    const t = count === 1 ? 0.5 : i / (count - 1);
    const base = slopeProfile(slope, t);

    let height = CITY.minHeight + base * (CITY.maxHeight - CITY.minHeight);
    height += rng.range(-CITY.heightJitter, CITY.heightJitter);
    height = Math.max(CITY.minHeight, Math.min(CITY.maxHeight, height));

    buildings.push({ x, width, height, decorSeed: rng.derive() });
    x += width;
  }

  // Edificios de los extremos: los gorilas quedan en los bordes de la pantalla,
  // con la ciudad entera de por medio y el maximo recorrido posible.
  const homeA = 0;
  const homeB = count - 1;

  return { seed, slope, buildings, homeA, homeB };
}

/**
 * Margen minimo hasta el borde de la arena. Con los gorilas en los edificios
 * extremos, el centro del edificio puede quedar tan al borde que al levantar
 * los brazos se salgan de cuadro. Se recorta hacia dentro lo justo.
 *
 * Es seguro: el ancho minimo de un edificio (>7u tras normalizar) garantiza que
 * el punto recortado sigue cayendo sobre su propio tejado.
 */
const EDGE_MARGIN = 5;

/** Punto (centro, tejado) donde se planta un gorila, en unidades de mundo. */
export function rooftop(city: City, index: number): { x: number; y: number } {
  const b = city.buildings[index];
  if (!b) throw new Error(`Edificio ${index} inexistente`);
  const centro = b.x + b.width / 2;
  return {
    x: Math.min(Math.max(centro, EDGE_MARGIN), WORLD_WIDTH - EDGE_MARGIN),
    y: b.height,
  };
}
