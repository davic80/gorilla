import { describe, expect, it } from 'vitest';
import { CITY, PHYSICS, powerToSpeed } from './constants';
import { FIXED_STEP } from './loop';
import { apexRise, interpolate, isSpent, launch, stepProjectile } from './physics';

function volar(angulo: number, potencia: number, viento: number, pasos: number) {
  const p = launch(10, 30, angulo, potencia, 1);
  for (let i = 0; i < pasos; i++) stepProjectile(p, viento, FIXED_STEP);
  return p;
}

describe('powerToSpeed', () => {
  it('mapea 0..100 al rango de velocidad', () => {
    expect(powerToSpeed(0)).toBeCloseTo(PHYSICS.minSpeed, 9);
    expect(powerToSpeed(100)).toBeCloseTo(PHYSICS.maxSpeed, 9);
  });

  it('recorta fuera de rango en vez de extrapolar', () => {
    expect(powerToSpeed(-50)).toBeCloseTo(PHYSICS.minSpeed, 9);
    expect(powerToSpeed(500)).toBeCloseTo(PHYSICS.maxSpeed, 9);
  });
});

describe('stepProjectile', () => {
  it('es reproducible bit a bit', () => {
    const a = volar(52, 70, 3.7, 2000);
    const b = volar(52, 70, 3.7, 2000);
    // Igualdad exacta, no aproximada: los retos por URL dependen de esto.
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.vx).toBe(b.vx);
    expect(a.vy).toBe(b.vy);
  });

  it('el orden de los pasos importa pero el resultado no deriva', () => {
    // Mismo total de tiempo partido en dos tandas: debe dar lo mismo.
    const p = launch(10, 30, 45, 60, 1);
    for (let i = 0; i < 300; i++) stepProjectile(p, 2, FIXED_STEP);
    const q = launch(10, 30, 45, 60, 1);
    for (let i = 0; i < 150; i++) stepProjectile(q, 2, FIXED_STEP);
    for (let i = 0; i < 150; i++) stepProjectile(q, 2, FIXED_STEP);
    expect(p.x).toBe(q.x);
    expect(p.y).toBe(q.y);
  });

  it('facing invierte la direccion horizontal', () => {
    const der = launch(50, 20, 45, 60, 1);
    const izq = launch(50, 20, 45, 60, -1);
    expect(der.vx).toBeCloseTo(-izq.vx, 9);
    expect(der.vy).toBeCloseTo(izq.vy, 9);
  });

  it('sin viento la parabola es simetrica respecto al apice', () => {
    const p = launch(0, 0, 45, 70, 1);
    let apiceX = 0;
    let apiceY = -Infinity;
    const alturas: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 4000 && p.y >= 0; i++) {
      stepProjectile(p, 0, FIXED_STEP);
      alturas.push({ x: p.x, y: p.y });
      if (p.y > apiceY) {
        apiceY = p.y;
        apiceX = p.x;
      }
    }
    const alcance = alturas[alturas.length - 1]!.x;
    // El apice cae en la mitad del alcance con error de discretizacion pequeno.
    expect(apiceX / alcance).toBeCloseTo(0.5, 2);
  });

  it('el alcance sin viento se acerca a la solucion analitica', () => {
    const angulo = 45;
    const v = powerToSpeed(70);
    const teorico = (v * v * Math.sin((2 * angulo * Math.PI) / 180)) / PHYSICS.gravity;

    const p = launch(0, 0, angulo, 70, 1);
    while (p.y >= 0 && p.t < PHYSICS.maxFlightTime) stepProjectile(p, 0, FIXED_STEP);

    // Euler semi-implicito introduce un sesgo de orden dt; 2% es holgado.
    expect(p.x).toBeGreaterThan(teorico * 0.98);
    expect(p.x).toBeLessThan(teorico * 1.02);
  });

  it('el viento positivo desplaza la caida hacia la derecha', () => {
    const sin = volar(45, 70, 0, 400);
    const con = volar(45, 70, 5, 400);
    expect(con.x).toBeGreaterThan(sin.x);
  });

  it('el viento no altera la componente vertical', () => {
    const sin = volar(45, 70, 0, 400);
    const con = volar(45, 70, -8, 400);
    expect(con.y).toBe(sin.y);
  });

  it('un intercambio entre tejados respeta el presupuesto de ritmo', () => {
    // El caso real de juego es tejado a tejado, no tejado a suelo. Presupuesto
    // del plan: 1,2-1,8 s. Si esto se rompe hay que recalibrar la gravedad.
    const TEJADO = 35;
    const p = launch(15, TEJADO, 50, 69, 1);
    do {
      stepProjectile(p, 0, FIXED_STEP);
    } while (p.y >= TEJADO && p.t < PHYSICS.maxFlightTime);

    expect(p.t).toBeGreaterThan(1.2);
    expect(p.t).toBeLessThan(1.8);
    // Y debe llegar de un gorila al otro: estan separados unas 70u.
    expect(p.x - 15).toBeGreaterThan(65);
  });

  it('un fallo que cae al suelo no dispara la espera por las nubes', () => {
    // Peor caso: el platano se cuela por un hueco hasta el suelo. Aqui es donde
    // entra el acelerado x3 al tocar la pantalla, pero el tiempo bruto tampoco
    // debe dispararse.
    const p = launch(15, 35, 55, 66, 1);
    while (p.y >= 0 && p.t < PHYSICS.maxFlightTime) stepProjectile(p, 0, FIXED_STEP);
    expect(p.t).toBeLessThan(2.5);
  });
});

describe('balance: la fisica tiene que poder con la ciudad', () => {
  it('la torre mas alta posible se supera desde el tejado mas bajo', () => {
    // Invariante de jugabilidad: si esto se rompe, hay semillas donde un jugador
    // no puede alcanzar al otro por mucho que afine, y la partida esta muerta
    // antes de empezar. Ata el techo de `CITY.maxHeight` a la fisica real.
    const alcanceMaximo = CITY.minHeight + apexRise(100, 80);
    expect(alcanceMaximo).toBeGreaterThan(CITY.maxHeight * 1.3);
  });

  it('superar la torre mas alta no exige potencia maxima', () => {
    // Con margen: a potencia 85 y angulo comodo tambien debe salir, o el juego
    // se reduce a "dale siempre al maximo".
    const holgado = CITY.minHeight + apexRise(85, 70);
    expect(holgado).toBeGreaterThan(CITY.maxHeight);
  });

  it('apexRise coincide con la simulacion', () => {
    const p = launch(0, 0, 65, 75, 1);
    let cima = 0;
    while (p.vy > 0 && p.t < PHYSICS.maxFlightTime) {
      stepProjectile(p, 0, FIXED_STEP);
      cima = Math.max(cima, p.y);
    }
    expect(cima).toBeCloseTo(apexRise(75, 65), 0);
  });
});

describe('interpolate', () => {
  it('alpha 0 y 1 dan los extremos del paso', () => {
    const p = launch(10, 20, 45, 60, 1);
    stepProjectile(p, 0, FIXED_STEP);
    expect(interpolate(p, 0)).toEqual({ x: p.px, y: p.py });
    expect(interpolate(p, 1).x).toBeCloseTo(p.x, 12);
    expect(interpolate(p, 1).y).toBeCloseTo(p.y, 12);
  });
});

describe('isSpent', () => {
  it('corta los vuelos perdidos', () => {
    const p = launch(0, 0, 89, 100, 1);
    expect(isSpent(p)).toBe(false);
    for (let i = 0; i < PHYSICS.maxFlightTime / FIXED_STEP + 10; i++) {
      stepProjectile(p, 0, FIXED_STEP);
    }
    expect(isSpent(p)).toBe(true);
  });
});
