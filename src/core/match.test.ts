import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from './loop';
import {
  ANGLE_MAX,
  ANGLE_MIN,
  clampAim,
  createMatch,
  fire,
  hitBox,
  launchPoint,
  nextRound,
  previewTrajectory,
  stepMatch,
  windForTurn,
  type Match,
} from './match';

/** Corre la partida hasta que salga de la fase dada, con tope de seguridad. */
function runUntilOut(match: Match, phase: string, maxSeconds = 20): void {
  const limit = maxSeconds / FIXED_STEP;
  for (let i = 0; i < limit && match.phase === phase; i++) stepMatch(match, FIXED_STEP);
}

describe('createMatch', () => {
  it('la misma semilla da la misma partida inicial', () => {
    const a = createMatch(2468);
    const b = createMatch(2468);
    expect(a.city).toEqual(b.city);
    expect(a.wind).toBe(b.wind);
    expect(a.terrain.cells).toEqual(b.terrain.cells);
  });

  it('empieza apuntando, jugador 1, marcador a cero', () => {
    const match = createMatch(1);
    expect(match.phase).toBe('aiming');
    expect(match.current).toBe(0);
    expect(match.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('los gorilas se miran', () => {
    const match = createMatch(1);
    expect(match.players[0].facing).toBe(1);
    expect(match.players[1].facing).toBe(-1);
    expect(hitBox(match, 0).x0).toBeLessThan(hitBox(match, 1).x0);
  });

  it('el platano sale fuera de la silueta del lanzador', () => {
    const match = createMatch(1);
    for (const player of [0, 1] as const) {
      const from = launchPoint(match, player);
      const box = hitBox(match, player);
      expect(from.x < box.x0 || from.x > box.x1).toBe(true);
    }
  });
});

describe('viento', () => {
  it('se deriva de (semilla, turno): reproducible pero distinto cada turno', () => {
    const seed = 987654;
    const serie = [0, 1, 2, 3, 4].map((t) => windForTurn(seed, t));
    expect(serie).toEqual([0, 1, 2, 3, 4].map((t) => windForTurn(seed, t)));
    expect(new Set(serie).size).toBe(5);
  });

  it('cambia al pasar el turno', () => {
    const match = createMatch(555);
    const inicial = match.wind;
    match.players[0].aim = { angle: 80, power: 5 };
    fire(match);
    runUntilOut(match, 'flying');
    runUntilOut(match, 'impact');
    expect(match.wind).not.toBe(inicial);
  });

  it('se mantiene en un rango jugable', () => {
    for (let t = 0; t < 400; t++) {
      expect(Math.abs(windForTurn(12345, t))).toBeLessThan(16);
    }
  });
});

describe('clampAim', () => {
  it('recorta angulo y potencia al rango jugable', () => {
    expect(clampAim({ angle: 999, power: 999 })).toEqual({ angle: ANGLE_MAX, power: 100 });
    expect(clampAim({ angle: -999, power: -5 })).toEqual({ angle: ANGLE_MIN, power: 0 });
  });
});

describe('turno', () => {
  it('fire pasa a vuelo y crea proyectil', () => {
    const match = createMatch(11);
    fire(match);
    expect(match.phase).toBe('flying');
    expect(match.projectile).not.toBeNull();
  });

  it('fire no hace nada si no toca apuntar', () => {
    const match = createMatch(11);
    fire(match);
    const antes = match.projectile;
    fire(match);
    expect(match.projectile).toBe(antes);
  });

  it('un tiro fallado devuelve el turno al rival', () => {
    const match = createMatch(24680);
    // Potencia maxima con angulo de crucero: pasa por encima de la ciudad y
    // del rival, y se sale de la arena sin tocar nada.
    match.players[0].aim = { angle: 60, power: 100 };
    fire(match);
    runUntilOut(match, 'flying', 30);
    runUntilOut(match, 'impact');
    expect(match.phase).toBe('aiming');
    expect(match.current).toBe(1);
  });

  it('guarda la estela del tiro para dibujar el fantasma', () => {
    const match = createMatch(31);
    match.players[0].aim = { angle: 45, power: 55 };
    fire(match);
    runUntilOut(match, 'flying');
    runUntilOut(match, 'impact');
    expect(match.players[0].ghost?.length ?? 0).toBeGreaterThan(5);
  });

  it('la punteria persiste de un turno al siguiente', () => {
    // Es la base del horquillado: el original de 1991 te hacia reteclearla.
    const match = createMatch(41);
    match.players[0].aim = { angle: 52, power: 71 };
    fire(match);
    runUntilOut(match, 'flying', 30);
    runUntilOut(match, 'impact');
    expect(match.players[0].aim).toEqual({ angle: 52, power: 71 });
  });
});

describe('impacto', () => {
  it('un tiro a bocajarro se cobra el punto para el rival', () => {
    const match = createMatch(1234);
    // Casi vertical y sin fuerza: cae encima del que lanza.
    match.players[0].aim = { angle: 90, power: 2 };
    fire(match);
    runUntilOut(match, 'flying');
    expect(match.phase).toBe('impact');
    expect(match.impact?.hit).toBe(0);

    runUntilOut(match, 'impact');
    expect(match.players[1].score).toBe(1);
    expect(match.players[0].score).toBe(0);
  });

  it('la explosion abre crater en el terreno', () => {
    const match = createMatch(4321);
    const solidasAntes = match.terrain.cells.reduce((n, c) => n + (c ? 1 : 0), 0);
    match.players[0].aim = { angle: 20, power: 40 };
    fire(match);
    runUntilOut(match, 'flying');
    const solidasDespues = match.terrain.cells.reduce((n, c) => n + (c ? 1 : 0), 0);
    expect(solidasDespues).toBeLessThan(solidasAntes);
    expect(match.lastCarve).not.toBeNull();
  });

  it('la partida termina al llegar al objetivo', () => {
    const match = createMatch(1234, 1);
    match.players[0].aim = { angle: 90, power: 2 };
    fire(match);
    runUntilOut(match, 'flying');
    runUntilOut(match, 'impact');
    expect(match.phase).toBe('matchOver');
  });
});

describe('previewTrajectory', () => {
  it('no toca el estado de la partida', () => {
    const match = createMatch(52);
    const antes = JSON.stringify({ phase: match.phase, trail: match.trail, turn: match.turn });
    previewTrajectory(match, { angle: 45, power: 60 }, 0, 0.35, FIXED_STEP);
    expect(JSON.stringify({ phase: match.phase, trail: match.trail, turn: match.turn })).toBe(
      antes,
    );
  });

  it('arranca en la mano del gorila y sigue el tiro real', () => {
    const match = createMatch(53);
    const aim = { angle: 50, power: 65 };
    const preview = previewTrajectory(match, aim, 0, 0.5, FIXED_STEP);
    const from = launchPoint(match, 0);
    expect(preview[0]).toEqual({ x: from.x, y: from.y });

    // Se comprueba paso a paso mientras el platano siga vivo: con los gorilas
    // en los extremos, un tiro puede estrellarse contra el edificio contiguo
    // enseguida, y el arco de ayuda tiene que coincidir hasta ese momento.
    match.players[0].aim = aim;
    fire(match);
    let comprobados = 0;
    for (let i = 1; i <= 60 && match.projectile && i < preview.length; i++) {
      stepMatch(match, FIXED_STEP);
      if (!match.projectile) break;
      expect(match.projectile.x).toBeCloseTo(preview[i]!.x, 6);
      expect(match.projectile.y).toBeCloseTo(preview[i]!.y, 6);
      comprobados++;
    }
    expect(comprobados).toBeGreaterThan(5);
  });

  it('se corta al chocar en vez de atravesar la ciudad', () => {
    const match = createMatch(54);
    const largo = previewTrajectory(match, { angle: 3, power: 100 }, 0, 6, FIXED_STEP);
    expect(largo.length).toBeLessThan(6 / FIXED_STEP);
  });
});

describe('nextRound', () => {
  it('cambia de ciudad conservando el marcador', () => {
    const match = createMatch(61);
    match.players[0].score = 2;
    match.players[1].score = 1;
    const siguiente = nextRound(match, 1);

    expect(siguiente.players[0].score).toBe(2);
    expect(siguiente.players[1].score).toBe(1);
    expect(siguiente.city).not.toEqual(match.city);
    expect(siguiente.round).toBe(2);
    expect(siguiente.phase).toBe('aiming');
  });

  it('abre el turno quien encajo el ultimo golpe', () => {
    expect(nextRound(createMatch(62), 1).current).toBe(1);
    expect(nextRound(createMatch(62), 0).current).toBe(0);
  });
});

describe('determinismo de partida completa', () => {
  it('la misma semilla y los mismos tiros dan el mismo terreno', () => {
    const tiros = [
      { angle: 45, power: 60 },
      { angle: 70, power: 55 },
      { angle: 30, power: 80 },
      { angle: 55, power: 72 },
    ];

    const jugar = () => {
      const match = createMatch(90210);
      for (const aim of tiros) {
        if (match.phase !== 'aiming') break;
        match.players[match.current].aim = aim;
        fire(match);
        runUntilOut(match, 'flying', 30);
        runUntilOut(match, 'impact');
      }
      return match;
    };

    const a = jugar();
    const b = jugar();
    // Igualdad exacta de la mascara: es la condicion que hace posibles los
    // retos compartidos por URL en F6.
    expect(a.terrain.cells).toEqual(b.terrain.cells);
    expect(a.turn).toBe(b.turn);
    expect(a.players.map((p) => p.score)).toEqual(b.players.map((p) => p.score));
  });
});
