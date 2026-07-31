/**
 * Traducciones. Vive en la raiz de `src/` y no en `ui/` porque lo usan tanto el
 * HUD en DOM como el render en canvas: no es una capa, es vocabulario compartido.
 *
 * El idioma actual es estado de modulo a proposito. Enhebrarlo por cada llamada
 * de dibujo no compraria nada en un juego de este tamano y ensuciaria firmas que
 * ya son largas.
 */

export type Lang = 'es' | 'en';

export const LANGS: readonly Lang[] = ['es', 'en'];

const ES = {
  player: 'JUGADOR',
  hit: '¡TOCADO!',
  nearMiss: '¡ROZÓ!',
  wins: 'GANA {player}',
  tapRematch: 'Toca para la revancha',
  roundTo: 'RONDA PARA {player}',
  tapContinue: 'Toca para seguir',
  precision: 'P R E C I S I Ó N',
  dragHint: 'Arrastra desde aquí y suelta',
  assist: 'AYUDA',
  assistNovato: 'NOVATO · arco completo',
  assistNormal: 'NORMAL · solo el arranque',
  assistLeyenda: 'LEYENDA · sin ayuda',
  coffee: '☕ Invítame a un café',
  rotate: 'Gira el móvil',
  rotateHint: 'Gorilla se juega en vertical',
  coffeeTitle: '¿Un café?',
  coffeeBody:
    'Gorilla es gratis y sin anuncios. Si te está gustando, puedes invitarme a un café.',
  coffeeNote: 'Se abre en otra pestaña. Tu partida se queda tal cual está.',
  coffeeOpen: 'Abrir Ko-fi',
  coffeeLater: 'Ahora no',
  close: 'Cerrar',
} as const;

type Key = keyof typeof ES;

const EN: Record<Key, string> = {
  player: 'PLAYER',
  hit: 'HIT!',
  nearMiss: 'SO CLOSE!',
  wins: '{player} WINS',
  tapRematch: 'Tap for a rematch',
  roundTo: 'ROUND TO {player}',
  tapContinue: 'Tap to continue',
  precision: 'P R E C I S I O N',
  dragHint: 'Drag from here and release',
  assist: 'AIM HELP',
  assistNovato: 'ROOKIE · full arc',
  assistNormal: 'NORMAL · just the start',
  assistLeyenda: 'LEGEND · no help',
  coffee: '☕ Buy me a coffee',
  rotate: 'Rotate your phone',
  rotateHint: 'Gorilla is played in portrait',
  coffeeTitle: 'A coffee?',
  coffeeBody: "Gorilla is free and ad-free. If you're enjoying it, you can buy me a coffee.",
  coffeeNote: 'It opens in another tab. Your game stays exactly as it is.',
  coffeeOpen: 'Open Ko-fi',
  coffeeLater: 'Not now',
  close: 'Close',
};

/** Exportado para que los tests puedan comparar los dos idiomas entre si. */
export const STRINGS: Record<Lang, Record<Key, string>> = { es: ES, en: EN };

const STORAGE_KEY = 'gorilla.lang';

function isLang(value: unknown): value is Lang {
  return value === 'es' || value === 'en';
}

/** Preferencia guardada, si no la del navegador, si no espanol. */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* almacenamiento bloqueado: se sigue con la del navegador */
  }
  // `navigator` existe en Node moderno pero puede no traer `language`: leerlo a
  // ciegas reventaba fuera del navegador.
  const nav = typeof navigator === 'undefined' ? undefined : navigator.language;
  return typeof nav === 'string' && nav.startsWith('en') ? 'en' : 'es';
}

let current: Lang = detect();

export function lang(): Lang {
  return current;
}

export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* sin persistencia, pero el idioma cambia igual en esta sesion */
  }
  if (typeof document === 'undefined') return;
  document.documentElement.lang = next;
  applyTranslations();
}

export function t(key: Key, params?: Record<string, string>): string {
  let text: string = STRINGS[current][key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value);
    }
  }
  return text;
}

/** Nombre del jugador ya traducido: "JUGADOR 1" / "PLAYER 2". */
export function playerName(index: 0 | 1): string {
  return `${t('player')} ${index + 1}`;
}

/**
 * Rellena todo lo estatico del documento. Los nodos se marcan con `data-i18n`,
 * igual que en los otros proyectos, para que anadir texto no obligue a tocar
 * codigo.
 */
export function applyTranslations(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key && key in ES) el.textContent = t(key as Key);
  }
}
