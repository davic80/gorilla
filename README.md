# Gorilla

Remake móvil de [GORILLA.BAS](https://github.com/pmachapman/basic-samples/blob/master/QBASIC/GORILLA.BAS)
(Michael Abrash, IBM, 1991). Dos gorilas, plátanos explosivos y un skyline que
se va desmoronando a cada impacto.

**Control 100 % táctil, sin un solo botón**: se tensa arrastrando desde la
franja baja, se lanza al soltar y se cancela tocando con un segundo dedo.
Vertical, dos jugadores en el mismo móvil.

## Empezar

```bash
npm install
npm run dev
```

Para probarlo en un móvil de la red local:

```bash
npm run dev -- --host
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm test` | Suite completa (Vitest) |
| `npm run typecheck` | Solo comprobación de tipos |

`?diag=1` en la URL muestra qué canales de respuesta táctil hay vivos en el
dispositivo. `#seed=<n>` reproduce una partida concreta.

## Arquitectura

```
src/
  core/     # determinista, sin DOM — testeable sin navegador
  render/   # capas de canvas 2D
  input/    # gesto de puntería y respuesta táctil
  audio/    # efectos sintetizados, cero ficheros
  ui/       # HUD en DOM
```

Dos reglas sostienen todo lo demás:

**El núcleo es determinista.** Paso fijo de 1/240 s con acumulador, PRNG con
semilla y cero `Math.random` en `core/`. Sin eso no hay repeticiones, ni una IA
que reuse el simulador, ni retos compartibles por URL.

**El terreno tiene una sola fuente de verdad.** El render pinta a partir de la
máscara de colisión, nunca al revés, así que lo que ves y lo que choca no pueden
separarse con el tiempo.

El diseño, las decisiones tomadas y los hallazgos que las cambiaron están en
[PLAN.md](PLAN.md).

## Stack

TypeScript + Vite + Canvas2D. Sin motor de juego: lo único no trivial es el
terreno destruible, y con una máscara de píxeles se resuelve en unas ochenta
líneas. Todo el arte es procedural, así que no hay pipeline de assets y el
bundle se queda en ~13 KB gzip.
