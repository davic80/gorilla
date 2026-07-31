import { beforeEach, describe, expect, it } from 'vitest';
import { Feedback } from './feedback';

/** En Node no hay vibracion, ni switch, ni audio: queda el canal visual. */
function nuevo(): Feedback {
  const f = new Feedback();
  f.lastTick = Number.NEGATIVE_INFINITY;
  return f;
}

let feedback: Feedback;
beforeEach(() => {
  feedback = nuevo();
});

const pulso = (): boolean => Number.isFinite(feedback.lastTick);

describe('aimTick', () => {
  it('el primer toque no suena: no se ha cruzado nada todavia', () => {
    feedback.aimTick(45, 60, false);
    expect(pulso()).toBe(false);
  });

  it('tickea al cruzar un escalon', () => {
    feedback.aimTick(45, 60, false);
    feedback.aimTick(51, 60, false);
    expect(pulso()).toBe(true);
  });

  it('no tickea si no se cruza escalon', () => {
    feedback.aimTick(45, 60, false);
    feedback.aimTick(45.4, 60.2, false);
    expect(pulso()).toBe(false);
  });

  it('en modo grueso el escalon es de 5', () => {
    feedback.aimTick(40, 60, false);
    feedback.aimTick(42, 60, false);
    expect(pulso()).toBe(false);

    feedback.aimTick(44, 60, false);
    expect(pulso()).toBe(true);
  });

  it('en modo fino el escalon es de 1', () => {
    feedback.aimTick(40, 60, true);
    feedback.aimTick(41, 60, true);
    expect(pulso()).toBe(true);
  });

  it('la potencia tickea igual que el angulo', () => {
    feedback.aimTick(45, 60, true);
    feedback.aimTick(45, 62, true);
    expect(pulso()).toBe(true);
  });

  it('resetTicks evita el tick suelto al empezar otro arrastre', () => {
    feedback.aimTick(45, 60, false);
    feedback.resetTicks();
    feedback.aimTick(90, 100, false);
    expect(pulso()).toBe(false);
  });
});

describe('canales', () => {
  it('el destello visual no se silencia nunca', () => {
    // Es el suelo de la respuesta: sin el, un iPhone en silencio se queda sin
    // ninguna senal de que el dial se esta moviendo.
    feedback.setMuted(true);
    feedback.pulse();
    expect(pulso()).toBe(true);
  });

  it('informa de los canales disponibles sin reventar sin DOM', () => {
    const c = feedback.channels();
    expect(typeof c.vibrate).toBe('boolean');
    expect(typeof c.iosSwitch).toBe('boolean');
    expect(typeof c.audio).toBe('boolean');
  });

  it('pulse no falla aunque no haya ningun canal de hardware', () => {
    expect(() => feedback.pulse()).not.toThrow();
  });
});
