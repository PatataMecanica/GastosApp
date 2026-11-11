# Gastos S&A

App de gastos compartidos para dos personas (Adri y Stephy). PWA estática servida por GitHub Pages; los datos viven en una hoja de Google a través de un Apps Script. Todo el texto de la interfaz, los comentarios y la documentación están en español.

- Qué debe hacer y por qué: [`REQUIREMENTS.md`](REQUIREMENTS.md)
- Cómo está hecho (datos, sincronización, cálculos): [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Instalación para los usuarios: [`README.md`](README.md)

## Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Esqueleto: cabecera, vista, barra de navegación, hoja inferior, aviso |
| `app.js` | Toda la lógica: estado, cálculo, sincronización, vistas y eventos |
| `styles.css` | Estilos, con variables de color para claro y oscuro |
| `sw.js` | Service worker: guarda la app para abrirla sin conexión |
| `manifest.webmanifest`, `icons/` | Instalación en la pantalla de inicio |
| `apps-script/Code.gs` | API que se pega a mano en la hoja de Google |

No hay dependencias, ni compilación, ni `package.json`. JavaScript y CSS sin frameworks; mantenerlo así.

## Ejecutar y probar

```bash
python3 -m http.server 8765   # y abrir http://localhost:8765
node --check app.js           # comprobación de sintaxis
```

- No hay pruebas automáticas en el repositorio. Los cambios se han verificado con Playwright contra una hoja simulada: se carga `Code.gs` con `vm` de Node, con dobles de `SpreadsheetApp`, `PropertiesService`, `LockService`, `ContentService` y `Utilities`, y se interceptan las peticiones a `script.google.com`.
- En local la app habla con la hoja real en cuanto se escribe la palabra clave. Para probar sin tocar datos reales, intercepta las peticiones o no la escribas.
- El service worker solo se registra bajo `https:`, así que en `localhost` no interfiere.
- Valores de referencia con el histórico de 2026: en noviembre Adri ingresa 455,39 € y Stephy 314,00 €; en agosto a Adri le sale −140,92 €.

## Despliegue

- **App**: GitHub Pages sirve la raíz de `main`. Fusionar en `main` es publicar.
- **Script**: `Code.gs` no se despliega solo. Si cambia, hay que pegarlo en el editor de Apps Script y publicar con *Implementar → Gestionar implementaciones → editar → Nueva versión*, para que la URL no cambie. Avisar siempre al usuario cuando un cambio toque `Code.gs`.
- **Caché**: al cambiar cualquier archivo de la app, subir la versión de `CACHE` en `sw.js` (`gastos-sa-vN`). La versión nueva se ve en la segunda apertura.

## Reglas que no hay que romper

- **Ningún dato personal en el repositorio**, que es público: ni gastos, ni importes del presupuesto, ni la palabra clave. El histórico se importa desde un archivo que no se versiona.
- **La palabra clave nunca va en el código.** Está en la propiedad `CLAVE` del script y en el `localStorage` de cada móvil. La URL del script sí es pública (constante `API` en `app.js`).
- **Peticiones sin cabeceras propias y siempre por POST.** Apps Script no responde al *preflight* de CORS; el cuerpo va como texto plano con JSON dentro.
- **Las operaciones deben ser idempotentes** (`put` por id, `del` por id, `budget` por mes): la cola se reintenta entera si falla la red.
- **`Code.gs` reescribe las pestañas completas** en cada escritura. Columnas añadidas a mano en la hoja se pierden; si hace falta un campo nuevo, añadirlo a `COLS_G` o `COLS_P`.
- **Fechas como texto** `AAAA-MM-DD` y meses como `AAAA-MM`. Se comparan como cadenas; no convertir a `Date` para calcular.
- **Escapar con `esc()`** todo lo que venga de datos al componer HTML.
- **El reparto es siempre 50/50** y solo hay dos personas (`PEOPLE` en `app.js`). Los colores de cada uno salen del nombre como clase CSS (`.dot.Adri`, `.av.Stephy`).

## Diseño

Importa mucho: una de las usuarias es diseñadora. Hay tres estilos, elegibles en Ajustes junto con el modo (sistema, claro u oscuro):

- **Pastel** (por defecto): elegante, colores pastel o mate, tipografía Fraunces para títulos y cifras y DM Sans para el texto.
- **Neón**: futurista, verdes y azules de neón con detalles en rosa, Chakra Petch para títulos y cifras. Vive al final de `styles.css`, bajo `[data-style="neon"]`, y casi todo son variables redefinidas.
- **Ochentas** (`retro`): estridente y muy colorido a propósito; títulos en rojo neón de noche, atardecer a rayas, sombras duras de colores. Bajo `[data-style="retro"]`, después del Neón.

Usar las variables de `styles.css` en lugar de colores sueltos y comprobar siempre los tres estilos en claro y oscuro a ancho de móvil (390 px). El modo se aplica con `data-theme` en `<html>`, no con `prefers-color-scheme` en el CSS. Los colores de persona de cada estilo están validados para daltonismo; si se cambian, volver a validarlos.
