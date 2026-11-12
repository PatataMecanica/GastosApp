# Arquitectura

```
 Móvil (PWA)                         Google
┌──────────────────────────┐        ┌───────────────────────────────┐
│ app.js                   │  POST  │ Apps Script (Code.gs)         │
│  estado en localStorage  │ ─────► │  comprueba CLAVE              │
│  cola de cambios         │ ◄───── │  aplica cambios, devuelve todo│
│ sw.js (caché de la app)  │  JSON  │ Hoja: «Gastos», «Presupuesto»,│
│                          │        │  «Movimientos», «Reglas»      │
└──────────────────────────┘        └───────────────────────────────┘
        ▲ archivos estáticos
   GitHub Pages (rama main)
```

No hay servidor propio. GitHub Pages sirve los archivos y la hoja de Google hace de base de datos.

## Modelo de datos

### Pestaña `Gastos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | texto | UUID generado en el móvil. Si una fila escrita a mano no lo tiene, el script le pone uno. |
| `fecha` | texto `AAAA-MM-DD` | La columna tiene formato de texto. Al leer se aceptan también fechas de Sheets y `DD/MM/AAAA`. |
| `concepto` | texto | |
| `importe` | número | Positivo. Al leer se admite coma decimal. |
| `pagador` | texto | `Adri` o `Stephy`. |
| `categoria` | texto | Libre; puede estar vacía. |
| `nota` | texto | Opcional. |
| `modificado` | texto ISO | Fecha y hora del último cambio. |

### Pestaña `Presupuesto`

| Columna | Tipo | Notas |
|---|---|---|
| `desde` | texto `AAAA-MM` | Primer mes en que se aplica esta versión. |
| `categoria` | texto | Nombre de la partida. |
| `importe` | número | Importe mensual. |

Todas las filas con el mismo `desde` forman una versión del presupuesto. La vigente en un mes es la de `desde` más reciente que no sea posterior a ese mes; si el mes es anterior a todas, se usa la más antigua.

### Pestaña `Movimientos`

El extracto del banco. Solo sirve para el análisis; no interviene en las aportaciones.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | texto | `b` más una huella del contenido de la fila del CSV, para que el mismo movimiento reciba siempre el mismo id. |
| `fecha` | texto `AAAA-MM-DD` | La de finalización, que es la que usa Revolut para decidir en qué extracto entra. |
| `concepto` | texto | La descripción del banco. |
| `importe` | número | Con el signo del banco: negativo es un gasto. Incluye la comisión. |
| `tipo` | texto | «Pago con tarjeta», «Transferencia», «Recarga»… |
| `categoria` | texto | Vacía mientras no se revise. `No contar` lo deja fuera de los cálculos. |

### Pestaña `Reglas`

| Columna | Tipo | Notas |
|---|---|---|
| `texto` | texto | Si el concepto de un movimiento lo contiene (sin distinguir mayúsculas ni tildes), se le aplica la regla. Con varias, gana la de texto más largo. |
| `categoria` | texto | |

### Estado local

En `localStorage`, bajo la clave `gastos_sa`:

| Campo | Contenido |
|---|---|
| `me` | Quién usa este móvil |
| `clave` | Palabra clave |
| `gastos`, `presupuesto`, `movs`, `reglas` | Copia de la hoja |
| `mv` | Versión de `movs` y `reglas` que se tiene, tal como la dio el script |
| `queue` | Cambios pendientes de enviar |
| `lastSync` | Momento de la última sincronización correcta |
| `tema` | Modo: `auto` (el del sistema), `light` u `dark` |
| `estilo` | Estilo visual: `pastel`, `neon` o `retro` (Ochentas) |

`tema` y `estilo` son preferencias de cada móvil y no se envían a la hoja ni entran en la copia de seguridad. Ver [Diseño](#diseño).

## Cálculos

Están en `app.js`, en el bloque «cálculo».

| Función | Fórmula |
|---|---|
| `budgetTotal(mes)` | Suma de las partidas de la versión vigente |
| `share(mes)` | `budgetTotal(mes) / 2` |
| `advanced(persona, mes)` | Suma de los gastos de esa persona con fecha en ese mes |
| `contribution(persona, mes)` | `share(mes) − advanced(persona, mes anterior)` |
| `realSpend(mes)` | Suma, para las dos personas, de `contribution + advanced` del mes |

| `bankSpend(mes)` | Suma cambiada de signo de los movimientos del mes que no son `No contar` |
| `actualSpend(mes)` | `bankSpend(mes)` más lo adelantado por los dos ese mes |

El «gasto real medio» de un año es la media de `realSpend` sobre los meses transcurridos: desde el primer mes con datos hasta el mes actual.

«Gastado de verdad» es la media de `actualSpend` sobre los meses cerrados con extracto; el mes en curso no entra porque su extracto está a medias. La diferencia con `realSpend` en esos mismos meses es lo que la común acumula o pierde.

La media por categoría suma dos medias: lo adelantado en el año entre los meses transcurridos y lo pagado desde la común entre los meses cerrados con extracto. Se compara con la partida del presupuesto vigente en el último mes transcurrido.

### Extracto del banco

`readStatement` (bloque «extracto del banco» de `app.js`) lee el CSV de Revolut: separador `,` o `;`, comillas, cabeceras en español o inglés. Antes, `decodeCsv` lo convierte a texto: acepta UTF-8 y Windows-1252 y repara las tildes estropeadas («DescripciÃ³n»), que es como llega el extracto en español; las cabeceras se comparan solo por sus letras sin tilde. Descarta las filas que no están completadas, las de otra divisa y las de la cuenta de ahorro, y se queda con fecha, concepto, tipo e importe (importe menos comisión). El saldo y la fecha de inicio solo se usan para calcular el id.

`bankGuess` decide la categoría al importar:

1. La regla que case con el concepto (`ruleFor`).
2. `No contar` si el importe es positivo y el tipo no es un reembolso.
3. `guessCategory` en modo estricto: mismo concepto ya clasificado en un adelanto, o nombre de categoría dentro del concepto. Sin palabras clave, porque aquí nadie revisa la sugerencia.

### Sugerencia de categoría

`guessCategory(concepto, mes)` prueba, en este orden:

1. La categoría del gasto más reciente con el mismo concepto.
2. Una categoría cuyo nombre aparezca como palabra en el concepto.
3. Una lista corta de palabras clave (`KEYWORDS`) para comida, ocio, teléfono y luz.

Solo actúa en gastos nuevos y deja de hacerlo en cuanto se elige una categoría a mano.

## Sincronización

### Protocolo

Una sola llamada, siempre `POST` a la URL del script, con el cuerpo como texto plano:

```json
{ "clave": "…", "ops": [ { "t": "put", "g": { "id": "…", "fecha": "2026-11-05", "…": "…" } } ] }
```

| Operación | Efecto |
|---|---|
| `{ "t": "put", "g": {…} }` | Crea el gasto o sustituye el que tenga ese `id` |
| `{ "t": "del", "id": "…" }` | Elimina el gasto |
| `{ "t": "budget", "desde": "AAAA-MM", "items": [{ "categoria", "importe" }] }` | Sustituye la versión del presupuesto de ese mes |
| `{ "t": "madd", "ms": [{ "id", "fecha", "concepto", "importe", "tipo", "categoria" }] }` | Añade los movimientos cuyo `id` no exista; a los demás no los toca |
| `{ "t": "mcat", "ids": ["…"], "categoria": "…" }` | Pone esa categoría a esos movimientos |
| `{ "t": "rule", "texto": "…", "categoria": "…" }` | Crea o sustituye la regla de ese texto; con categoría vacía, la quita |

Con `ops` vacío es una lectura. La respuesta trae siempre el estado completo:

```json
{ "ok": true, "v": 2, "gastos": [ … ], "presupuesto": [ … ], "mv": "…", "movimientos": [ … ], "reglas": [ … ] }
```

Los movimientos son muchos más que los adelantos, así que no viajan siempre. `mv` es una huella (MD5) de `movimientos` y `reglas`; la app envía la que tiene en el campo `mv` de la petición y, si coincide, la respuesta llega sin esas dos listas. Como la huella se calcula leyendo la hoja, los cambios hechos a mano también se detectan.

`v` identifica la versión del script. Si la respuesta no la trae, el script publicado es anterior a los movimientos del banco: la app conserva en la cola las operaciones del banco, avisa con «Falta actualizar el script» y desactiva la importación.

Si falla: `{ "ok": false, "error": "clave" }` cuando la palabra clave no coincide, o un texto con el error en otro caso.

### En el móvil

1. Cada cambio se aplica al estado local, se añade a `queue` y se guarda. La interfaz se actualiza al instante.
2. `sync()` envía la cola entera.
3. Si responde bien, se quitan de la cola las operaciones enviadas, se sustituye la copia local por lo recibido y se vuelven a aplicar las que se hayan añadido mientras tanto.
4. Si falla, la cola se conserva y se reintenta.

Se sincroniza al abrir, al volver a la app, al recuperar la conexión, cada 60 segundos con la app visible y al pulsar el indicador de estado. No se sincroniza con un formulario abierto, para no redibujar debajo.

Todas las operaciones son idempotentes, así que reenviar una cola que sí había llegado no duplica nada.

### Conflictos

Gana el último que escribe. Si los dos editan el mismo gasto antes de sincronizar, queda la versión que llegue después. Para dos personas y gastos que casi nunca se editan es suficiente.

### En el script

- `LockService` serializa las peticiones, de modo que dos móviles no escriben a la vez.
- Cada escritura reordena y reescribe completas las pestañas afectadas, y solo esas: apuntar un adelanto no reescribe `Movimientos`.
- Por eso las columnas añadidas a mano en la hoja no se conservan.

## Seguridad

- El script se publica como aplicación web que se ejecuta como su propietario y admite a cualquier usuario. No hay cuentas de Google de por medio.
- La URL es pública. Lo que protege la hoja es la propiedad `CLAVE` del script, que se compara con la enviada sin distinguir mayúsculas ni espacios repetidos.
- Sin `CLAVE` definida se rechaza todo.
- Cada intento fallido espera 1,5 segundos antes de responder. No hay bloqueo por intentos, para que nadie pueda dejar fuera a los usuarios fallando a propósito; la protección real es la longitud de la frase.
- La clave se guarda sin cifrar en el `localStorage` del móvil. Quien tenga el móvil desbloqueado tiene acceso.
- Si la hoja rechaza una clave que antes funcionaba, la app la borra y la vuelve a pedir.

## Sin conexión

`sw.js` guarda los archivos de la app y las tipografías, responde con la copia guardada y la actualiza en segundo plano. Las peticiones a Google no pasan por la caché. Al publicar una versión nueva hay que cambiar el nombre de `CACHE`; los móviles la muestran en la segunda apertura.

## Interfaz

`app.js` no usa frameworks. `render()` compone la vista activa como una cadena de HTML y la vuelca en `#view`. Los eventos se atienden con delegación desde `document`, leyendo atributos `data-*` o el `id` del elemento.

| Vista | Función |
|---|---|
| Bienvenida y palabra clave | `viewWelcome`, `viewKey` |
| Inicio | `viewInicio` |
| Adelantos y Banco (selector `ui.src`) | `viewGastos`, `gastosListHtml`, `bancoListHtml` |
| Análisis | `viewAnalisis`, `barsSvg` |
| Ajustes | `viewAjustes` |
| Formularios (hoja inferior) | `openGasto`, `openBudget` |
| Banco (hoja inferior) | `importCsv` (resumen antes de guardar), `openReview` (sin categoría, por comercio), `openPick` (categoría y regla), `openRules` |

Los gráficos son SVG y HTML hechos a mano. Los nombres de persona se usan como clase CSS para darles color.

En Ajustes, los botones de modo y estilo llevan `data-tema` y `data-estilo`; al pulsarlos se guarda la preferencia, se llama a `applyDesign` y se vuelve a dibujar.

## Diseño

El aspecto depende de dos atributos de `<html>`:

| Atributo | Valores | De dónde sale |
|---|---|---|
| `data-theme` | `light`, `dark` | `S.tema`; con `auto` se resuelve con `prefers-color-scheme` |
| `data-style` | `pastel`, `neon`, `retro` | `S.estilo` |

`applyDesign` (en `app.js`) los pone al arrancar, al cambiar cualquiera de los dos en Ajustes y cuando el sistema pasa de claro a oscuro. También copia el color de fondo a las etiquetas `theme-color`, para que la barra del navegador acompañe. Un script mínimo en la cabecera de `index.html` pone los mismos atributos antes del primer pintado para que no parpadee; si se añade un estilo hay que añadirlo también ahí.

En `styles.css` el CSS no usa `prefers-color-scheme`: todo cuelga de los atributos.

| Selector | Contenido |
|---|---|
| `:root` | Variables de Pastel en claro |
| `:root[data-theme="dark"]` | Pastel en oscuro |
| `:root[data-style="neon"]` y `…[data-theme="dark"]` | Variables de Neón, claro y oscuro |
| `:root[data-style="retro"]` y `…[data-theme="dark"]` | Variables de Ochentas, claro y oscuro |
| `[data-style="…"] .componente` | Remates propios de cada estilo, al final del archivo |

Los componentes se escriben una sola vez con variables (`--bg`, `--surface`, `--ink`, `--accent`, `--shadow`…). Un estilo es, sobre todo, otro juego de valores para esas variables, más unas pocas reglas para lo que una variable no alcanza: el resplandor de fondo, la tarjeta principal, las sombras duras de Ochentas. Los nombres `--sage`, `--butter`, `--lilac` y `--serif` vienen de Pastel; en los otros estilos significan «relleno», «fondo destacado», «aviso» y «tipografía de títulos y cifras».

| Estilo | Títulos y cifras | Persona A / B |
|---|---|---|
| Pastel | Fraunces | azul / coral |
| Neón | Chakra Petch | cian / magenta |
| Ochentas | Fraunces, en mayúsculas en la cabecera | azul / naranja |

El texto va siempre en DM Sans. Las tipografías se cargan de Google Fonts en `index.html`; el navegador solo descarga las que usa el estilo activo.

Los colores de persona se validaron simulando protanopia, deuteranopia y tritanopia y midiendo la diferencia de color entre los dos, además de su contraste sobre el fondo de las tarjetas.

### Añadir un estilo

1. Añadirlo a `ESTILOS` en `app.js` (clave y nombre visible) y a la comprobación del script de la cabecera de `index.html`.
2. En `styles.css`, un bloque de variables para claro y otro para oscuro bajo `:root[data-style="clave"]`, y una muestra `.sw.clave` para el botón del selector.
3. Validar los colores de persona para daltonismo.
4. Revisar las cuatro pestañas, los formularios y la bienvenida en claro y oscuro a 390 px.

El selector de estilo es una rejilla de tres columnas (`.segm.three`); con un cuarto estilo habría que rehacerla.
### Deslizar entre pestañas

Además de la barra inferior, se cambia de pestaña deslizando el dedo en horizontal (bloque «deslizar entre pestañas» de `app.js`):

- La página real (`#app`: cabecera y vista) se mueve con `transform` siguiendo al dedo. La pestaña vecina se pinta en una segunda página temporal, `.peek`, fija a pantalla completa y colocada a un ancho de pantalla de distancia. Se compone con las mismas funciones (`topHtml`, `VIEWS`) y se le quitan los `id` para que no se dupliquen. Por eso los estilos de página y cabecera van por clase (`.page`, `.head`) y no por id.
- La vecina se muestra tal como quedará al llegar, arriba del todo, aunque la página actual esté desplazada. Al completar el gesto se llama a `go()`, se quita la transformación y se retira `.peek`, sin salto visible.
- El gesto se decide tras 10 px: si es claramente horizontal se queda con él; si no, el desplazamiento vertical sigue siendo del navegador (`touch-action: pan-y` en `#app`). Al soltar cambia de pestaña si se pasó del 40 % del ancho o si el dedo iba rápido; en caso contrario vuelve. En la primera y la última pestaña hay resistencia de goma.
- No se activa con la hoja inferior abierta, en las pantallas de bienvenida, sobre la barra de navegación, al empezar en un campo de texto ni, fuera de la app instalada, al empezar a menos de 24 px del borde (ahí manda el gesto «atrás» del navegador).
- Los eventos `touchmove` y `touchend` se escuchan en el elemento tocado, no en `document`: si una sincronización repinta la vista a medio gesto, ese elemento sale del documento y sus eventos dejarían de llegar.
- Con «reducir movimiento» activado en el sistema, el cambio al soltar es inmediato.

## Limitaciones conocidas

- El script de Google tarda entre uno y tres segundos en responder; por eso la interfaz no espera a la red.
- En iPhone, la app instalada guarda sus datos aparte de Safari, así que puede pedir la palabra clave otra vez tras instalarla.
- No hay pruebas automáticas en el repositorio.
- Añadir una tercera persona o un reparto distinto exige cambiar los cálculos y el diseño, no solo la lista `PEOPLE`.
