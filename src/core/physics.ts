/**
 * Integrador de la trayectoria del platano.
 *
 * Euler semi-implicito: primero velocidad, luego posicion. Con paso fijo es
 * estable, reversible en la practica y bit a bit reproducible, que es lo que
 * exigen la IA (reusa este mismo simulador) y los retos por semilla.
 *
 * Modelo, heredado del original de 1991:
 *   a_x = viento * windAccel        (aceleracion, no velocidad constante)
 *   a_y = -gravedad
 */

import { PHYSICS, powerToSpeed } from './constants';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Posicion del paso anterior, para interpolar el render. */
  px: number;
  py: number;
  /** Tiempo de vuelo acumulado. */
  t: number;
}

/**
 * @param angleDeg angulo sobre la horizontal
 * @param power    potencia de UI en 0..100
 * @param facing   +1 lanza hacia la derecha, -1 hacia la izquierda
 */
export function launch(
  x: number,
  y: number,
  angleDeg: number,
  power: number,
  facing: 1 | -1,
): Projectile {
  const speed = powerToSpeed(power);
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x,
    y,
    px: x,
    py: y,
    vx: Math.cos(rad) * speed * facing,
    vy: Math.sin(rad) * speed,
    t: 0,
  };
}

/**
 * Altura maxima que gana un tiro sobre su punto de salida, analitica.
 *
 * Es el techo fisico del juego: ningun edificio puede pasar de esto o habria
 * semillas imposibles de ganar. Se usa para validar el balance de la ciudad.
 */
export function apexRise(power: number, angleDeg: number): number {
  const vy = Math.sin((angleDeg * Math.PI) / 180) * powerToSpeed(power);
  return (vy * vy) / (2 * PHYSICS.gravity);
}

/** Avanza un paso fijo. Muta el proyectil para no asignar memoria por paso. */
export function stepProjectile(p: Projectile, wind: number, dt: number): void {
  p.px = p.x;
  p.py = p.y;

  p.vx += wind * PHYSICS.windAccel * dt;
  p.vy -= PHYSICS.gravity * dt;

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.t += dt;
}

/** Posicion interpolada para el render entre dos pasos fijos. */
export function interpolate(p: Projectile, alpha: number): { x: number; y: number } {
  return {
    x: p.px + (p.x - p.px) * alpha,
    y: p.py + (p.y - p.py) * alpha,
  };
}

export function isSpent(p: Projectile): boolean {
  return p.t >= PHYSICS.maxFlightTime;
}
