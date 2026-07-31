# Gorilla — remake móvil de GORILLA.BAS (1991)

Artillería por turnos, dos gorilas, plátanos explosivos, skyline destruible.
Objetivo: mismo bucle de juego que el original, con control táctil y estética moderna.

---

## 1. Qué hacía el original (y qué conviene conservar)

Michael Abrash, IBM, 1991. ~1.134 líneas de QBasic distribuidas con MS-DOS 5.

Física real del original:

```basic
t# = t# + .1
x# = StartXPos + (InitXVel# * t#) + (.5 * (Wind / 5) * t# ^ 2)
y# = StartYPos + ((-1 * (InitYVel# * t#)) + (.5 * gravity# * t# ^ 2)) * (ScrHeight / 350)
InitXVel# = COS(Angle#) * Velocity
InitYVel# = SIN(Angle#) * Velocity
```

| Parámetro | Original |
|---|---|
| Gravedad | 9.8 configurable |
| Viento | `FnRan(10) - 5`, con 1/3 de probabilidad de amplificarse → rango real ≈ −15..+15 |
| Entrada | Ángulo 0–360°, velocidad tecleada cada turno |
| Edificios | 8–12, anchos y alturas aleatorias, 4 patrones de pendiente |
| Explosión | radio = `ScrHeight / 50` |
| Colisión | `POINT()` sobre los píxeles ya pintados |
| Victoria | primer jugador a N puntos (3 por defecto) |
| Sol | reacciona con cara de susto al recibir un impacto |

**Lo que hay que conservar sí o sí:**

1. **El bucle de horquillado.** Tiro corto → tiro largo → impacto. Es una búsqueda binaria con feedback visual. Ahí está toda la adicción del juego: no es puntería, es deducción, y produce la sensación de "lo he resuelto yo".
2. **Ciudad nueva cada partida.** Rejugabilidad a coste cero.
3. **El viento como excusa.** Aleatoriedad justa que impide memorizar y da coartada al perdedor ("es que ha cambiado el viento").
4. **Cero fricción.** El original arrancaba en 2 segundos y no tenía menús.

**Lo que hay que arreglar:**

- Tenías que **reteclear ángulo y potencia enteros cada turno**. En móvil eso es letal: el ajuste debe partir de tu tiro anterior.
- Terreno **no destruible** de verdad (solo cráteres cosméticos limitados). Hoy la destrucción progresiva es un motor dramático gratis.
- Partidas que se **empantanan** cuando los dos jugadores son malos.

Fuentes: [GORILLA.BAS (código)](https://github.com/pmachapman/basic-samples/blob/master/QBASIC/GORILLA.BAS) · [Gorillas (1991), OldGames](https://www.oldgames.sk/en/game/gorillas) · [QBasic Gorillas – The Precursor to WORMS](https://www.retrogaminggeek.com/qbasic-gorillas-the-precursor-to-worms/) · [Joystuck: por qué enganchaba](https://www.joystuck.co.uk/gorillas-bas-the-batty-bash-of-the-90s-that-made-gaming-oddly-addictive/)

---

## 2. El control: ángulo y potencia con el dedo

Esta es la decisión que define el juego. Investigado el patrón dominante en móvil (drag & release tipo Angry Birds), tiene un problema serio para *este* juego: acopla ángulo y potencia en un solo vector, así que **no puedes repetir tu tiro anterior cambiando solo una variable** — y eso es exactamente lo que necesita el bucle de horquillado.

La solución no es elegir uno u otro, sino **dos capas sobre el mismo estado**.

### Capa 1 — Gesto: "tensa y suelta"

- Tocas en **cualquier punto de la mitad inferior** de la pantalla (no sobre el gorila: el dedo no debe tapar la trayectoria).
- Ese punto se vuelve el ancla. Arrastras **hacia atrás**, como un tirachinas: la dirección del tiro es la opuesta al arrastre, la distancia es la potencia.
- El gorila **se echa hacia atrás proporcionalmente**, el plátano vibra y brilla al máximo de tensión. La potencia se *ve* antes de soltar.
- Al superar el radio máximo (~140 px CSS) entra **modo fino**: seguir arrastrando ajusta con ganancia 0.25×. Es el truco del cursor de iOS y resuelve la precisión en pantallas pequeñas sin añadir UI.
- **Tick háptico** cada 5° / 5 de potencia en modo grueso, cada 1 en modo fino. Esto es lo que convierte un arrastre en un *dial físico*. Barato de implementar, desproporcionadamente satisfactorio.
- Sueltas → dispara.

- **Cancelar con un segundo dedo.** Si el tiro que estás montando no te convence,
  tocas con otro dedo y se aborta sin gastar el turno: sueltas y vuelves a tensar
  desde donde quieras. Un arrastre por debajo de 14 px también cuenta como
  cancelación, para que un roce no te queme el turno.

### Capa 2 — Precisión: sin un solo botón

**Control 100% táctil: no hay botones.** Ni nudges, ni Lanzar, ni Siguiente. Se
tensa arrastrando, se lanza al soltar, se cancela con el segundo dedo y se pasa
de ronda tocando la pantalla.

Quitar los botones de ajuste `±1` se lleva por delante la forma más cómoda de
repetir el tiro anterior cambiando una sola variable. Lo que sostiene el bucle de
horquillado en su lugar:

- **El modo fino** (ganancia 0,25×) permite clavar un número exacto con el dedo:
  llegar a 100 de potencia son 238 px de arrastre, así que hay resolución de
  sobra para pararse en un valor concreto.
- **La mira persiste** entre turnos: cada turno arranca donde lo dejaste.
- **Marca del tiro anterior** en los dos indicadores — un tick en el arco de
  ángulo y una línea en la barra de potencia. Ves de dónde vienes y cuánto te has
  movido, no solo dónde estás. Esto es lo que sustituye a los botones.
- **Trayectoria fantasma** del tiro anterior, desvaneciéndose.

### Los indicadores van arriba

Ángulo y potencia se pintan en canvas **en la banda superior**, no en la franja de
control. Si estuvieran abajo, tu propia mano los taparía justo mientras apuntas,
que es el único momento en que importan. De paso, es el uso natural del cielo
sobrante que describe el hallazgo 2 de F0.

- **Ángulo**: arco con la aguja apuntando a donde saldrá el plátano, espejado
  según el gorila. La dirección se lee sin leer el número.
- **Potencia**: barra con relleno proporcional.
- Ambos con la cifra grande debajo y la marca del tiro anterior.
- Al cruzar al tramo fino aparece el rótulo `PRECISIÓN`: sin readout de texto, es
  la única señal de que has cambiado de resolución.

### Ayuda de mira (crítico para el equilibrio)

Mostrar la parábola completa **destruye el juego** — lo convierte en apuntar a una línea. Mostrar cero información hace que el primer tiro sea ciego y frustrante en móvil.

Tres niveles, seleccionables:

| Nivel | Previsualización |
|---|---|
| Novato | arco completo punteado |
| **Normal (por defecto)** | solo los primeros ~0,35 s de vuelo |
| Leyenda | nada, solo el vector de tensión |

### Alternativas descartadas (y por qué)

- **Barra de potencia oscilante** (tipo golf, tap para parar): añade destreza y *rompe la reproducibilidad*. Si no puedes repetir tu tiro, no puedes horquillar. Mata el núcleo del juego.
- **Dos sliders separados** (ángulo + potencia): preciso pero muerto. Cero sensación física, cero juice.
- **Solo drag & release puro**: rápido y sexy, pero sin la capa 2 la partida se vuelve azar en el minuto 3.

---

## 3. Qué lo hace adictivo (más allá del control)

Ordenado por retorno sobre esfuerzo:

1. **Skyline destruible de verdad.** Cada impacto se come un cráter en la máscara del terreno. A los 6–8 turnos la ciudad se ha derrumbado y se abren líneas de tiro que no existían. La partida escala sola.
2. **Casi-fallo con énfasis.** Si el plátano pasa a menos de ~2 unidades del rival: cámara lenta, zoom, sonido distinto, `¡ROZÓ!`. El casi-fallo es el disparador de dopamina más potente que existe en juegos de puntería, y es gratis.
3. **Muerte súbita.** Tras N turnos sin impacto, los edificios empiezan a hundirse (o cae lluvia de meteoritos que erosiona el skyline). Ninguna partida móvil debe durar más de ~3 minutos.
4. **Revancha en un toque.** Al acabar: `Revancha` y `Misma ciudad` (mismo seed). Sin menús, sin pantalla de carga. El "una más" tiene que costar cero.
5. **Repetición del tiro ganador.** Cámara lenta automática del impacto final + botón de compartir GIF/vídeo.
6. **Viento visible.** Banderas en los tejados, partículas a la deriva, un zumbido cuyo tono sigue la velocidad del viento. La información ambiental se lee sin mirar un número.
7. **El sol.** Se conserva la cara de susto del original. Acertarle da bonus (p. ej. *eclipse*: siguiente turno sin viento). Es puro cariño y la gente lo va a buscar.
8. **Ciudad del día.** Seed derivado de la fecha: todo el mundo juega el mismo escenario. Marcador local + texto compartible. Retención diaria sin servidor.
9. **Escalada por rondas.** Al mejor de 3/5: ronda 3 sube el viento, ronda 5 mete sol móvil o gravedad alterada.
10. **Modo mesa (opcional, muy vendible).** Móvil plano entre dos jugadores; el HUD rota 180° según a quién le toque. Convierte el "pásame el móvil" en algo con intención.

---

## 4. Física y determinismo

Mundo virtual en unidades, independiente de la resolución. `W = 100` unidades de ancho.

```
a_x = viento * k_w
a_y = g
p += v * dt ;  v += a * dt        (Euler semi-implícito)
```

- **Paso fijo** `dt = 1/240 s` con acumulador; render interpolado. Necesario para que la simulación sea determinista (repeticiones, IA que reusa el mismo motor, retos compartibles por seed).
- Gravedad calibrada para que **un tiro típico cruce la arena en 1,2–1,8 s**. Con distancia ~70 u y 45°, sale `g ≈ 60 u/s²`, `v ∈ [10, 90] u/s`. Ajustable — la duración de vuelo es una decisión de *ritmo*, no de realismo.
- Potencia UI 0–100 → `v` lineal en ese rango. Ángulo −20°..110° (permite tiros verticales y hacia atrás), espejado según el lado.
- **Aceleración de vuelo:** tocar la pantalla mientras vuela el plátano acelera ×3. Y si tras el ápice está claramente pasado de largo, acelera solo. Nada mata más el ritmo que ver una parábola perdida completa.
- **Colisión:** máscara de terreno en `Uint8Array` (1 bit por píxel de mundo). Muestreo DDA a lo largo del segmento en cada subpaso → sin tunneling a alta velocidad. Cráter = borrar un círculo en la máscara. Es exactamente lo que hacía el `POINT()` del original, pero robusto.
- **PRNG con seed** (mulberry32) para ciudad y viento → partidas reproducibles y compartibles.

---

## 5. IA (el "contra la máquina")

Nada de trucos: la CPU usa **el mismo simulador**.

1. Barrido de ángulos de 1 en 1, y para cada uno búsqueda binaria de la velocidad que impacta (comprobando obstáculos). Coste: unos pocos miles de pasos, irrelevante.
2. Sobre la solución exacta se aplica **error gaussiano** en ángulo y potencia, que **se reduce cada turno** — la CPU horquilla igual que un humano.

| Dificultad | σ inicial (ángulo / potencia) | Reducción por turno |
|---|---|---|
| Fácil | 12° / 15 | ×0.55 |
| Normal | 7° / 9 | ×0.40 |
| Difícil | 3° / 4 | ×0.25 |

Reglas de diseño: la CPU **nunca acierta en el turno 1** (se siente tramposo), y sus fallos deben ser *plausibles* — que le dé a un edificio, no que tire el plátano al vacío. Un 10% de tiros arriesgados de arco muy alto le da personalidad.

---

## 6. Estética

**Dirección recomendada: silueta vectorial sobre cielo degradado dinámico, con neón solo en plátano y explosiones.**

- Skyline como formas planas oscuras con ventanas iluminadas; al destruirse un trozo, las ventanas se apagan y saltan escombros.
- **Hora del día distinta cada ronda** (amanecer / atardecer / noche / tormenta): variedad visual con coste artístico cero, todo procedural.
- Plátano con estela luminosa, giro y squash-and-stretch. Gorilas vectoriales expresivos: anticipación al tensar, celebración, mofa.
- Explosiones: flash blanco de 2 frames → onda expansiva → escombros → humo.
- **Juice sincronizado** (esto importa más que el arte): hit-stop de ~80 ms en el impacto, sacudida de cámara direccional que se asienta rápido, partículas saliendo en el vector del golpe, háptico escalado a la magnitud.
- Todo procedural = bundle mínimo, nítido en cualquier DPR, sin pipeline de assets.
- Audio por WebAudio sintetizado (whoosh, thwack, explosión) + zumbido de viento con tono variable. Sin ficheros.

Referencias de juice: [Game Feel & Juice](https://egmatic.com/blog/how-to-make-your-game-feel-good) · [Juice in Game Design](https://www.bloodmooninteractive.com/articles/juice.html)

---

## 7. Stack y arquitectura

**TypeScript + Vite + Canvas2D. Sin motor de juego.**

Phaser/Pixi son overkill: no hay escenas complejas, ni físicas de cuerpos, ni atlas. Lo único no trivial es el terreno destruible, y con máscara de píxeles se resuelve en ~80 líneas. Un remake Canvas2D con paso fijo y terreno destruible ya se ha hecho en un solo fichero ([discusión three.js](https://discourse.threejs.org/t/canvas2d-reimplementation-of-gorillas-bas-with-fixed-timestep-physics-and-destructible-terrain/91477)); referencias abiertas: [jvalen/gorilla.bas](https://github.com/jvalen/gorilla.bas), [tehsis/Gorillas.js](https://github.com/tehsis/Gorillas.js).

```
src/
  core/          # determinista, sin DOM — testeable con Vitest
    rng.ts       # mulberry32 con seed
    physics.ts   # integrador de paso fijo
    terrain.ts   # máscara destruible + raycast DDA
    city.ts      # generación procedural de skyline
    match.ts     # máquina de estados de partida
    ai.ts        # solver + error decreciente
  render/        # sky, city, gorilla, banana, fx, camera
  input/         # aimController.ts, haptics.ts
  ui/            # HUD en DOM (texto nítido y accesible), no en canvas
  audio/
  app.ts
```

La separación `core` / `render` no es purismo: permite que la IA reuse el simulador exacto, que los tests de física corran sin navegador, y que un futuro modo online valide tiros.

- **Orientación: vertical (portrait) como primaria.** Es como se sostiene y se pasa un móvil. Compensación: 6–7 edificios en vez de 10–12 y arena más corta, para que **ambos gorilas estén siempre visibles** (imprescindible para juzgar el tiro). Cámara con zoom suave en el impacto. Horizontal soportado como vista "clásica".
- **PWA** instalable, offline, objetivo < 250 KB.
- Canvas con DPR, `safe-area-inset`, bloqueo de scroll/zoom, `pointer-events` unificados.

---

## 8. Plan de construcción

| Fase | Contenido | Criterio de salida |
|---|---|---|
| **F0** | Andamiaje Vite+TS, bucle de paso fijo, RNG con seed, generación de ciudad, render de cajas grises | Se ve un skyline distinto por seed a 60 fps en móvil real |
| **F1** ★ | Control "tensa y suelta" + capa de precisión, física, colisión, terreno destruible, 2 jugadores por turnos | **Vertical slice.** Dos personas juegan 10 minutos y quieren revancha |
| **F2** | Juice: cámara, shake, hit-stop, partículas, hápticos, audio, cámara lenta en casi-fallo | Cada impacto se siente |
| **F3** | IA con 3 dificultades | La CPU normal pierde ~50% contra un humano decente |
| **F4** | Estructura de partida: al mejor de N, muerte súbita, revancha instantánea, stats | Ninguna partida pasa de 3 min |
| **F5** | Pase artístico, cielos dinámicos, sol, PWA, skins | Instalable y presentable |
| **F6** | Opcional: ciudad del día, retos asíncronos por URL con seed | — |

**Punto de control obligatorio al final de F1:** si el control con el dedo no resulta divertido en 5 minutos de juego real en un móvil, se cambia *antes* de añadir nada más. Ninguna cantidad de partículas salva un control que no engancha.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Precisión insuficiente con el dedo | Modo fino con ganancia reducida, nudges ±1, ticks hápticos, estado persistente entre turnos |
| Turnos largos → se abandona | Vuelo de 1,2–1,8 s, aceleración al tocar, muerte súbita, sin animaciones bloqueantes |
| La previsualización trivializa el juego | Arco corto por defecto (0,35 s), niveles de ayuda |
| Arena apretada en vertical | Menos edificios, arena más corta, ambos gorilas siempre en pantalla |
| IA que se siente tramposa o tonta | Mismo simulador + error decreciente; nunca acierta al primer turno; fallos plausibles |
| Sobreingeniería del meta (skins, ligas, monedas) | Nada de meta antes de F5. El juego se sostiene o no en F1 |

---

## 10. Decisiones tomadas

1. **Control**: gesto "tensa y suelta" + capa de precisión (§2). Ambas capas entran en F1.
2. **Estética**: silueta vectorial sobre cielo degradado dinámico, neón solo en plátano y explosiones (§6). Todo procedural, sin assets.
3. **Alcance de v1**: completo, F0 → F6, incluyendo ciudad del día y retos asíncronos por URL con seed.

**Consecuencia del alcance completo sobre el orden de trabajo:** F6 amplía el destino, no el punto de partida. El orden F0→F6 se mantiene intacto y el punto de control del final de F1 sigue mandando: si el control no engancha en 5 minutos de juego real, se rehace antes de seguir. Construir los retos compartibles antes de validar el núcleo sería multiplicar superficie sobre una base sin verificar.

Dos exigencias que el alcance completo impone **desde F0**, y que por eso conviene fijar ya:

- **Determinismo estricto.** Los retos por URL solo funcionan si dos dispositivos simulan idéntico. Paso fijo, aritmética sin dependencias de plataforma, cero `Math.random` fuera del PRNG con seed. Tests de física en Vitest que verifiquen reproducibilidad bit a bit.
- **Formato de seed versionado.** La URL de un reto codifica seed + versión de reglas. Sin el número de versión, cualquier ajuste de balance rompe los retos ya compartidos.

Ambas son baratas si se asumen en F0 y caras de retrofitear en F6.

---

## 11. Estado

### F0 — completada

Andamiaje Vite + TS, bucle de paso fijo, RNG con semilla, ciudad procedural y
render en cajas grises. 53 tests en verde, typecheck limpio, build de 3,1 KB
gzip. Verificada a 60 fps en viewport de 375x812.

Pendiente del criterio de salida: **comprobacion en un movil fisico**. El panel
del navegador no sustituye a un dispositivo real para medir fps ni para juzgar
si la franja de control cae bajo el pulgar.

### F1 — completada

Vertical slice jugable: dos jugadores por turnos en el mismo movil, terreno
destruible con mascara de celdas y raycast sin tunneling, control "tensa y
suelta" con modo fino, nudges +-1 con repeticion, trayectoria fantasma, arco de
ayuda corto, viento por turno y marcador con revancha. 100 tests en verde, build
de 7,7 KB gzip.

Verificado en navegador a 375x812: ciclo completo de turno, crater abierto en el
edificio impactado, turno cedido al rival, y la regla de auto-impacto del
original (un tiro a 90 grados con poca fuerza te cae encima y le da el punto al
contrario).

Medido el mapeo de potencia contra el diseno: 85 px de tiron dan 52, 170 px dan
90 y ahi entra el modo fino, cuya ganancia sale exactamente 0,25x la del tramo
grueso. La potencia maxima se alcanza a 238 px, un arrastre realizable con el
pulgar.

**Pendiente y bloqueante para cerrar F1 de verdad: los cinco minutos de partida
real en un movil fisico.** Es el punto de control del plan y no lo sustituye
ninguna verificacion automatica.

### Revisión del control tras probarlo (30 jul 2026)

El gesto funciona. Se eliminan **todos** los botones y el control pasa a ser
puramente táctil (§2): cancelación con segundo dedo, indicadores visuales de
ángulo y potencia en la banda superior, y avance de ronda tocando la pantalla.

Riesgo asumido conscientemente: sin los nudges `±1`, ajustar en una sola variable
depende del pulso. Se compensa con el modo fino, la mira persistente y la marca
del tiro anterior en ambos indicadores. **Hay que revalidarlo en partida real**:
si horquillar se vuelve frustrante, la respuesta no es devolver los botones sino
bajar la ganancia del tramo fino.

### Segunda vuelta sobre el control y la presentación (30 jul 2026)

- **Zona de tiro acotada**: el gesto solo empieza en la línea de suelo o por
  debajo. Tensar desde el medio de la pantalla ponía la mano encima de la ciudad
  y de la trayectoria. La franja de control crece a 200 px / 28 % — más sitio
  para tensar es más resolución en el modo fino.
- **Potencia como cuña** con rampa verde → amarillo → naranja → rojo. Crece a lo
  ancho y a lo alto: la diferencia entre 30 y 90 se ve de reojo, cosa que una
  barra plana no da. La cifra toma el color de la rampa.
- **Solo vertical**: en apaisado no cabe la parábola y la ciudad se aplasta.
  Antes que degradar el juego, se tapa la pantalla y se pide girar. La
  simulación se pausa: nada de resolver un vuelo a ciegas.
- **Ajustes arriba**, fuera de la zona de arrastre: mute a la derecha del viento
  y nivel de ayuda a la izquierda. El de ayuda expone lo que ya existía
  hardcodeado (§2) — es el ajuste que más cambia la dificultad. Al tocarlo se
  anuncia qué ha hecho, porque un chip sin etiqueta no se entiende hasta que lo
  pulsas.
- **Sonido sintetizado** con WebAudio, cero ficheros: silbido de lanzamiento
  escalado a la potencia, estallido con sub grave, golpe seco contra edificio,
  fanfarria al acertar y el "uh uh uh".
- **Gorilas de verdad**: torso de barril, hombros anchos que caen a caderas
  estrechas, brazos largos, cabeza pequeña hundida entre los hombros con cresta
  sagital y ceja marcada, y silla plateada en el lomo. Brazos **alternos** en el
  "uh uh uh", con envolvente para que arranquen y terminen en reposo. Fuera del
  gesto, el brazo de lanzar apunta al ángulo: el gorila es también un indicador.
- **Gorilas en los edificios extremos**, con un recorte de 5u respecto al borde
  de la arena para que no se salgan de cuadro al levantar los brazos.
- **Ciudad con ventanas** y **cielo con luna y nubes en tres planos**, todo
  derivado de la semilla. Es el uso natural del cielo sobrante que describe el
  hallazgo 2 de F0: atmósfera en lugar de hueco muerto.

### Tercera vuelta de presentación (31 jul 2026)

- **Demo del gesto** en la franja de abajo: un dedo fantasma tensa y suelta en
  bucle, con la etiqueta «Arrastra desde aquí y suelta». Sin botones ni
  etiquetas nada indicaba de dónde se tira, y un jugador nuevo se quedaba
  mirando la pantalla. Se apaga para siempre en cuanto arrastra por primera vez.
- **Banda superior transparente**: el cielo, las nubes y la luna pasan por
  detrás de los indicadores. La legibilidad la sostiene un velo degradado que se
  desvanece hacia abajo, más sombra propia en arcos, cuña y cifras. Un
  rectángulo opaco separaba el HUD del juego como dos pantallas pegadas; así es
  una sola escena.
- **Brazos de gorila**: gruesos en el hombro, afinando a la muñeca y rematados
  por un puño grande con nudillos. Los nudillos desproporcionados son la mitad
  de la silueta del bicho, y un rectángulo uniforme no los daba. Mientras
  apuntas, el puño que lanza sostiene un plátano. Pies asomando bajo el torso.
- **Luces mucho más lentas**: 14-38 s las de parpadeo, 90-240 s las de
  encender/apagar. Un cambio de luz tiene que sorprenderte de reojo entre turno
  y turno, no competir con la trayectoria.
- **Nubes más grandes** en los tres planos.

### Colisión y reacciones (31 jul 2026)

**La caja de golpeo no cubría al gorila dibujado.** Reportado jugando: el
plátano rozaba la cabeza y no pasaba nada. La caja medía 5 × 6 unidades mientras
la silueta dibujada llega a 5,8 × 8,9 — **más de la mitad de la cabeza quedaba
fuera**, así que el plátano la atravesaba por encima del área de colisión. Un
juego en el que ves un impacto y no cuenta parece roto, y con razón.

Además el reventón se medía **al centro del cuerpo**: un plátano caído a los
pies quedaba fuera de rango mientras uno a la altura del pecho, a la misma
distancia real, sí mataba.

Corregido en dos frentes:

- La caja pasa a 5,8 × 8,8 y `scene.test.ts` la **ata a la silueta dibujada**,
  con tolerancia por los dos lados. Un cambio de arte no puede volver a
  desincronizarlas en silencio, que es exactamente cómo apareció este fallo.
- El alcance del estallido se mide **a la superficie del cuerpo**, no a un
  punto. La regla queda: si la onda toca al gorila, lo mata.

**Reacciones nuevas**, porque un fallo por poco tenía que verse:

- **Agacharse**: un plátano que pasa a menos de 7,5u hace que el gorila se
  aplaste contra el tejado, con sonido. Si sobrevive, se ríe. Baja de golpe y
  se incorpora despacio — agacharse es un reflejo, levantarse es comprobar.
- **Golpe de pecho** por impaciencia: si nadie apunta durante ~9-15 s, un gorila
  se golpea el pecho. Sustituye al gesto aleatorio anterior, que saltaba
  estuvieras jugando o no.
- Los dos gestos comparten motor y se distinguen por el signo del barrido: el
  «uh uh uh» lanza los brazos arriba y afuera, el golpe de pecho los cruza hacia
  dentro.

### Hallazgos de F1 que cambian el plan

**La potencia máxima se quedaba corta, y el culpable era la geometría.** Al
mover los gorilas a los edificios extremos, la distancia entre ellos pasó de
~70u a ~90u. Eso no rompe los tiros cómodos, pero sí los que importan: para
superar una torre central hacen falta ángulos de 70-75°, y ahí el alcance se
desploma porque `R = v²·sen2θ/g` y `sen150° = 0,5`. A 90 u/s un globo de 75°
llegaba a 67u — no cruzaba, y había posiciones sin respuesta posible.

Recalibrado a `gravity 90`, `maxSpeed 135`: un globo de 75° cruza ~100u y el
tiro típico entre tejados sigue dentro del presupuesto de 1,2-1,8 s. De propina,
el ápice máximo (`v²/2g ≈ 101u`) cabe dentro de `PLAY_HEIGHT`, así que ni el
tiro más alto se sale de cuadro. **Lección: el techo de potencia no lo fija el
tiro cómodo sino el peor caso jugable**, y cambiar dónde se plantan los gorilas
es cambiar la física necesaria.



**El primer intento de vibración no funcionaba en ningún sitio.** El fallo era de
raíz: se detectaba que `navigator.vibrate` existe, no que el aparato vibre de
verdad. La API existe en Chrome de escritorio y en Android con la vibración
desactivada en ajustes, y en ambos casos devuelve `true` sin hacer nada — y como
"existía", el código nunca creaba el canal de audio de respaldo. Resultado: cero
respuesta en vez de una degradada.

Corregido con **canales redundantes en vez de excluyentes**: se disparan todos
los disponibles y siempre queda al menos uno. Al no haber forma fiable de
consultar la capacidad real, esa es la única estrategia robusta.

| Canal | Dónde funciona |
|---|---|
| Vibración | Android |
| Interruptor háptico | iOS 17.4+, vía un `<input switch>` oculto. Truco de plataforma, no API: puede romperse en cualquier versión |
| Clic de audio | En todas partes, salvo modo silencio |
| Destello visual | Siempre: no depende de hardware ni de ajustes |

Se añade `?diag=1`, que muestra qué canales hay vivos en el aparato concreto. Es
la única forma de diagnosticar un móvil que no se tiene delante.

**iOS no implementa la Vibration API.** El tick haptico por grado, que en la
seccion 2 es lo que convierte el arrastre en un dial fisico, no se puede
disparar desde la web en iPhone: `navigator.vibrate` sencillamente no existe en
Safari. No es un fallo de implementacion, es el navegador.

Mitigaciones, por orden de preferencia:

1. **Interruptor háptico** (iOS 17.4+): un `<input type="checkbox" switch>` oculto
   al que se hace `click()`. Es lo único que llega a lo táctil en iPhone desde
   web, pero es un truco de plataforma, no una API: **sin verificar en
   dispositivo real** y puede dejar de funcionar en cualquier versión de iOS.
2. **Clic de audio**: funciona siempre que el móvil no esté en silencio.
3. **Destello visual** sobre las cifras: implementado y activo. Es el suelo de la
   respuesta y el único canal que no depende de hardware ni de ajustes.

Si tras probar en iPhone el tick táctil resulta imprescindible y el truco del
interruptor no cumple, la única vía es empaquetar como app nativa. Es una
decisión de F5/F6, no de ahora.

### Hallazgos de F0 que cambian el plan

**1. El techo de altura de los edificios lo dicta la fisica, no el gusto.**
Con `gravity: 60` y `maxSpeed: 90`, el apice maximo sobre el punto de salida es
de ~65u. La altura maxima inicial (0,62 x ancho = 62u) generaba semillas con
torres practicamente imposibles de superar desde un tejado bajo: partidas
muertas antes de empezar. Bajada a 0,45 x ancho, con un test que ata el techo a
la fisica real (`physics.test.ts`) para que nadie lo suba sin recalibrar.

**2. En vertical siempre sobra cielo, y no se arregla escalando.**
La proporcion de pantalla que ocupa el juego depende solo de
(altura de edificio / ancho de arena) y del formato del movil: cambiar las
unidades del mundo no altera nada. Y no se puede llenar subiendo las parabolas,
porque un globo alto en una arena de 70u tarda ~2,9 s y revienta el presupuesto
de ritmo. **El ritmo gana**: las parabolas se quedan tensas y el sobrante se
convierte en banda de HUD explicita (marcador, viento, turno) mas atmosfera en
F5. La pantalla queda repartida en HUD / juego / franja de control.

**3. Los dos limites del reloj eran redundantes.**
`MAX_FRAME_DELTA / FIXED_STEP` daba exactamente `MAX_STEPS_PER_FRAME`, asi que
el recorte de delta ya topaba los pasos y la rama que avisaba de tiempo
descartado nunca se ejecutaba: el bucle tiraba tiempo real en silencio. Ahora
`dropped` cubre los dos casos.
