/**
 * Constantes del mundo. Las unidades son "unidades de mundo" (u), no pixeles:
 * el ancho del mundo es SIEMPRE 100u y la escala en pixeles se deriva del ancho
 * de pantalla. Asi la partida es identica en cualquier movil, que es lo que
 * necesitan los retos compartibles por semilla.
 *
 * El eje Y apunta HACIA ARRIBA con y=0 en el suelo (convencion de fisica).
 * La proyeccion a pantalla invierte el eje en `render/viewport.ts`.
 */

export const WORLD_WIDTH = 100;

/** Version de las reglas. Va codificada en la URL de los retos: cualquier */
/** cambio de balance debe subirla o invalidaria los retos ya compartidos.   */
export const RULES_VERSION = 1;

export const CITY = {
  minBuildings: 6,
  maxBuildings: 8,
  /** Anchos crudos antes de normalizar para que sumen exactamente WORLD_WIDTH. */
  minWidth: 9,
  maxWidth: 20,
  /**
   * Alturas relativas al ANCHO del mundo, no al alto: independientes del movil.
   *
   * El techo esta atado a la fisica, no al gusto: con `maxSpeed` y `gravity`
   * actuales el apice maximo alcanzable ronda las 65u sobre el punto de
   * lanzamiento, asi que una torre de mas de ~45u seria imposible de superar
   * desde un tejado bajo y generaria semillas invendibles. Lo verifica
   * `physics.test.ts`; si se toca la fisica, hay que revisar esto.
   */
  minHeight: 0.12 * WORLD_WIDTH,
  maxHeight: 0.45 * WORLD_WIDTH,
  /** Ruido sobre el perfil de pendiente, en unidades de mundo. */
  heightJitter: 0.07 * WORLD_WIDTH,
  /** Separacion visual entre edificios. */
  gap: 0.9,
} as const;

export const PHYSICS = {
  /**
   * Calibrada para que un tiro tipico cruce la arena en 1,2-1,8 s. Es una
   * decision de RITMO, no de realismo: en movil, un vuelo largo mata la partida.
   */
  gravity: 90,
  /** Aceleracion horizontal por unidad de viento. */
  windAccel: 1.6,
  /**
   * Rango de la UI de potencia 0..100 mapeado a velocidad inicial.
   *
   * El techo lo fija el peor caso real, no el tiro comodo: con los gorilas en
   * los extremos hay ~90u entre ellos, y para superar una torre central hacen
   * falta angulos de 70-75 grados, donde el alcance se desploma
   * (R = v²·sen2θ/g, y sen150° = 0,5). A 135 u/s un globo de 75 grados todavia
   * cruza ~100u; por debajo, la potencia maxima se quedaba corta y habia
   * posiciones sin respuesta posible.
   *
   * De propina, el apice maximo (v²/2g ≈ 101u) cabe dentro de PLAY_HEIGHT, asi
   * que ni el tiro mas alto se sale de cuadro.
   */
  minSpeed: 15,
  maxSpeed: 135,
  /** Corta vuelos perdidos para que el turno no se eternice. */
  maxFlightTime: 12,
} as const;

/**
 * Altura de mundo reservada al juego por encima del suelo: skyline mas espacio
 * de parabola. Lo que sobra en pantallas altas es banda de HUD, no hueco muerto.
 *
 * En vertical la arena completa (100u de ancho) siempre deja cielo de sobra: la
 * relacion depende solo de (altura de edificio / ancho de arena) y del formato
 * de pantalla, asi que no se arregla escalando. Se enmarca.
 */
export const PLAY_HEIGHT = 130;

/**
 * Segundos de trayectoria que muestra el arco de ayuda.
 *
 * El arco completo trivializa el juego: lo convierte en apuntar a una linea y
 * mata el horquillado, que es de donde sale toda la adiccion. Por defecto solo
 * se ve el arranque.
 */
export const ASSIST_SECONDS = {
  novato: 6,
  normal: 0.35,
  leyenda: 0,
} as const;

export type AssistLevel = keyof typeof ASSIST_SECONDS;

/** Mapea la potencia de UI (0..100) a velocidad inicial en u/s. */
export function powerToSpeed(power: number): number {
  const t = Math.max(0, Math.min(100, power)) / 100;
  return PHYSICS.minSpeed + t * (PHYSICS.maxSpeed - PHYSICS.minSpeed);
}
