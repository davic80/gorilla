import { describe, expect, it } from 'vitest';
import { LANGS, STRINGS, lang, playerName, t } from './i18n';

describe('catalogo de traducciones', () => {
  it('los dos idiomas tienen exactamente las mismas claves', () => {
    // Una clave que falte en un idioma sale como `undefined` en pantalla, y eso
    // no se ve hasta que alguien cambia de idioma jugando.
    const [es, en] = LANGS.map((l) => Object.keys(STRINGS[l]).sort());
    expect(es).toEqual(en);
  });

  it('ningun texto se queda vacio', () => {
    for (const l of LANGS) {
      for (const [key, value] of Object.entries(STRINGS[l])) {
        expect(value.trim(), `${l}.${key}`).not.toBe('');
      }
    }
  });

  it('los huecos a rellenar coinciden en ambos idiomas', () => {
    // Si la version inglesa olvida el {player}, el marcador final se queda sin
    // decir quien ha ganado.
    const huecos = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(STRINGS.es) as Array<keyof typeof STRINGS.es>) {
      expect(huecos(STRINGS.en[key]), key).toEqual(huecos(STRINGS.es[key]));
    }
  });

  it('las traducciones son distintas de verdad, no copias', () => {
    const iguales = (Object.keys(STRINGS.es) as Array<keyof typeof STRINGS.es>).filter(
      (k) => STRINGS.es[k] === STRINGS.en[k],
    );
    // Solo el emoji del cafe podria coincidir; nada mas deberia.
    expect(iguales.length).toBeLessThan(3);
  });
});

describe('t', () => {
  it('sustituye los huecos', () => {
    expect(t('wins', { player: 'JUGADOR 1' })).toContain('JUGADOR 1');
    expect(t('wins', { player: 'JUGADOR 1' })).not.toContain('{player}');
  });

  it('deja el texto intacto si no hay nada que sustituir', () => {
    expect(t('hit')).toBe(STRINGS[lang()].hit);
  });
});

describe('playerName', () => {
  it('numera desde uno, no desde cero', () => {
    // Un "JUGADOR 0" en pantalla delata el indice interno.
    expect(playerName(0)).toMatch(/\s1$/);
    expect(playerName(1)).toMatch(/\s2$/);
  });

  it('no usa abreviaturas', () => {
    expect(playerName(0)).not.toContain('JUG ');
  });
});
