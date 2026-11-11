# Arquitectura

```
 Móvil (PWA)                         Google
┌──────────────────────────┐        ┌───────────────────────────────┐
│ app.js                   │  POST  │ Apps Script (Code.gs)         │
│  estado en localStorage  │ ─────► │  comprueba CLAVE              │
│  cola de cambios         │ ◄───── │  aplica cambios, devuelve todo│
│ sw.js (caché de la app)  │  JSON  │ Hoja: «Gastos», «Presupuesto» │
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

### Estado local

En `localStorage`, bajo la clave `gastos_sa`:

| Campo | Contenido |
|---|---|
| `me` | Quién usa este móvil |
| `clave` | Palabra clave |
| `gastos`, `presupuesto` | Copia de la hoja |
| `queue` | Cambios pendientes de enviar |
| `lastSync` | Momento de la última sincronización correcta |
| `tema` | Modo: `auto` (el del sistema), `light` u `dark` |
| `estilo` | Estilo visual: `pastel`, `neon` o `retro` (Ochentas) |

`tema` y `estilo` son preferencias de cada móvil y no se envían a la hoja. `applyDesign` (en `app.js`) los traduce a los atributos `data-theme` y `data-style` de `<html>`, de los que cuelgan las variables de color de `styles.css`. Un script mínimo en la cabecera de `index.html` pone esos atributos antes del primer pintado para que no parpadee.

## Cálculos

Están en `app.js`, en el bloque «cálculo».

| Función | Fórmula |
|---|---|
| `budgetTotal(mes)` | Suma de las partidas de la versión vigente |
| `share(mes)` | `budgetTotal(mes) / 2` |
| `advanced(persona, mes)` | Suma de los gastos de esa persona con fecha en ese mes |
| `contribution(persona, mes)` | `share(mes) − advanced(persona, mes anterior)` |
| `realSpend(mes)` | Suma, para las dos personas, de `contribution + advanced` del mes |

El «gasto real medio» de un año es la media de `realSpend` sobre los meses transcurridos: desde el primer mes con datos hasta el mes actual.

La media por categoría divide lo adelantado en el año entre esos mismos meses y la compara con la partida del presupuesto vigente en el último de ellos.

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

Con `ops` vacío es una lectura. La respuesta trae siempre el estado completo:

```json
{ "ok": true, "gastos": [ … ], "presupuesto": [ … ] }
```

Si falla: `{ "ok": false, "error": "clave" }` cuando la palabra clave no coincide, o un texto con el error en otro caso.

### En el móvil

1. Cada cambio se aplica al estado local, se añade a `queue` y se guarda. La interfaz se actualiza al instante.
2. `sync()` envía la cola entera.
3. Si responde bien, se quitan de la cola las operaciones enviadas, se sustituye la copia local por lo recibido y se vuelven a aplicar las que se hayan añadido mientras tanto.
4. Si falla, la cola se conserva y se reintenta.

Se sincroniza al abrir, al volver a la app, al recuperar la conexión, cada 60 segundos con la app visible y al pulsar el indicador de estado. No se sincroniza con un formulario abierto, para no redibujar debajo.

Las tres operaciones son idempotentes, así que reenviar una cola que sí había llegado no duplica nada.

### Conflictos

Gana el último que escribe. Si los dos editan el mismo gasto antes de sincronizar, queda la versión que llegue después. Para dos personas y gastos que casi nunca se editan es suficiente.

### En el script

- `LockService` serializa las peticiones, de modo que dos móviles no escriben a la vez.
- Cada escritura reordena por fecha y reescribe las dos pestañas completas. Es sencillo y basta para unos cientos de filas al año.
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
| Gastos | `viewGastos`, `gastosListHtml` |
| Análisis | `viewAnalisis`, `barsSvg` |
| Ajustes | `viewAjustes` |
| Formularios (hoja inferior) | `openGasto`, `openBudget` |

Los gráficos son SVG y HTML hechos a mano. Los nombres de persona se usan como clase CSS para darles color.

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
