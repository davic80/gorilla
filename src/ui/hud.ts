/**
 * HUD en DOM: marcador, viento, ajustes y banner de estado.
 *
 * El control de juego no tiene DOM — se apunta arrastrando y no hay un solo
 * boton de tiro. Lo unico que vive aqui son ajustes, y viven arriba, fuera de
 * la zona de arrastre. Para texto, el DOM le gana al canvas en nitidez y
 * accesibilidad.
 */

import type { AssistLevel } from '../core/constants';
import type { Match } from '../core/match';

export interface HudHooks {
  onToggleMute: () => void;
  onCycleAssist: () => void;
}

/** Etiqueta del chip de ayuda: cuantos puntos, cuanta ayuda. */
const ASSIST_CHIP: Record<AssistLevel, string> = {
  novato: '•••',
  normal: '••',
  leyenda: '•',
};

const ASSIST_NAME: Record<AssistLevel, string> = {
  novato: 'NOVATO · arco completo',
  normal: 'NORMAL · solo el arranque',
  leyenda: 'LEYENDA · sin ayuda',
};

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en el documento`);
  return el as T;
}

/**
 * Escribe solo si el valor cambio. `update` corre en cada frame: tocar el DOM
 * 60 veces por segundo para reescribir el mismo texto es trabajo regalado, y en
 * un movil de gama media eso se nota.
 */
function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

export class Hud {
  private readonly scoreA = need('scoreA');
  private readonly scoreB = need('scoreB');
  private readonly windArrow = need('windArrow');
  private readonly windValue = need('windValue');
  private readonly banner = need('banner');
  private readonly diag = need('diag');
  private readonly mute = need<HTMLButtonElement>('mute');
  private readonly assist = need<HTMLButtonElement>('assist');
  private readonly version = need('version');

  /** Aviso efimero que se impone al banner de estado. */
  private toast: { text: string; until: number } | null = null;

  constructor(hooks: HudHooks) {
    setText(this.version, `v${__APP_VERSION__}`);
    this.mute.addEventListener('click', () => hooks.onToggleMute());
    this.assist.addEventListener('click', () => hooks.onCycleAssist());
  }

  showDiagnostics(lines: string): void {
    setHidden(this.diag, false);
    setText(this.diag, lines);
  }

  setLayout(hudBand: number, footerHeight: number): void {
    const root = document.documentElement;
    root.style.setProperty('--hud-band', `${Math.max(64, hudBand)}px`);
    // Publicado desde el render: si el CSS y la zona de tiro discreparan, el
    // enlace acabaria robando arrastres o quedando fuera de alcance.
    root.style.setProperty('--footer-h', `${footerHeight}px`);
  }

  /** Un chip sin etiqueta no se entiende hasta que lo tocas: al tocarlo, lo dice. */
  showToast(text: string, seconds = 1.6): void {
    this.toast = { text, until: performance.now() / 1000 + seconds };
  }

  setMuted(muted: boolean): void {
    setText(this.mute, muted ? '🔇' : '🔊');
    this.mute.dataset.off = String(muted);
  }

  /** @param announce false al arrancar: nadie ha tocado nada que anunciar. */
  setAssist(level: AssistLevel, announce = true): void {
    setText(this.assist, ASSIST_CHIP[level]);
    this.assist.dataset.off = String(level === 'leyenda');
    if (announce) this.showToast(`AYUDA\n${ASSIST_NAME[level]}`);
  }

  update(match: Match): void {
    setText(this.scoreA, String(match.players[0].score));
    setText(this.scoreB, String(match.players[1].score));

    // La flecha apunta a donde empuja el viento; el numero da la magnitud.
    setText(this.windValue, Math.abs(match.wind).toFixed(1));
    const flip = match.wind < 0 ? 'scaleX(-1)' : 'none';
    if (this.windArrow.style.transform !== flip) this.windArrow.style.transform = flip;

    const turn = String(match.current);
    if (document.body.dataset.turn !== turn) document.body.dataset.turn = turn;

    if (this.toast && performance.now() / 1000 > this.toast.until) this.toast = null;
    const text = this.toast?.text ?? bannerText(match);
    setHidden(this.banner, text === null);
    if (text !== null) setText(this.banner, text);
  }
}

function bannerText(match: Match): string | null {
  const jugador = (i: 0 | 1) => (i === 0 ? 'JUG 1' : 'JUG 2');

  if (match.phase === 'matchOver') {
    const ganador = match.players[0].score > match.players[1].score ? 0 : 1;
    return `GANA ${jugador(ganador)}\nToca para la revancha`;
  }
  if (match.phase === 'roundOver') {
    const ganador = match.impact?.hit === 0 ? 1 : 0;
    return `RONDA PARA ${jugador(ganador)}\nToca para seguir`;
  }
  if (match.phase === 'impact' && match.impact) {
    if (match.impact.hit !== null) return '¡TOCADO!';
    if (match.impact.nearMiss) return '¡ROZÓ!';
  }
  return null;
}
