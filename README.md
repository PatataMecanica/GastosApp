# Gastos S&A

App de gastos compartidos para dos personas. Es una web instalable (PWA): se abre en el navegador del móvil y se añade a la pantalla de inicio, igual en Android que en iPhone. Los datos se guardan en una hoja de Google vuestra; en este repositorio solo hay código.

## Cómo funciona

- Hay un **presupuesto mensual** y cada uno ingresa la mitad en la cuenta común.
- Cuando alguien paga algo común de su bolsillo, lo apunta como **gasto adelantado**.
- Al mes siguiente ingresa **su mitad menos lo que adelantó** el mes anterior. Si sale negativo, la común le debe ese importe.
- El presupuesto se puede cambiar desde un mes concreto; los meses anteriores conservan el suyo.

## Puesta en marcha

### 1. Hoja de Google (una sola vez)

1. Crea una hoja de cálculo nueva en Google Sheets.
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda.
3. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
4. Autoriza el script cuando lo pida y copia la **URL de la aplicación web** (termina en `/exec`). Esa dirección va en la constante `API` de `app.js`.
5. Pon la palabra clave: **Configuración del proyecto** (el engranaje) → **Propiedades de la secuencia de comandos** → *Añadir propiedad*, con nombre `CLAVE` y como valor una frase larga (cuatro o cinco palabras).

Las pestañas `Gastos` y `Presupuesto` se crean solas. Se pueden editar a mano: la app recoge los cambios en la siguiente sincronización.

> La dirección es pública; lo que protege la hoja es la palabra clave, que solo está en Google y en cada móvil. Sin la propiedad `CLAVE` el script no deja pasar a nadie. No distingue mayúsculas ni espacios de más. Cambiarla no requiere publicar de nuevo.

Si cambias `Code.gs`, hay que publicar de nuevo: **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. Así la URL no cambia.

### 2. Publicar la app en GitHub Pages

**Settings → Pages → Build and deployment → Deploy from a branch**, elige la rama y la carpeta `/ (root)`. En el plan gratuito el repositorio tiene que ser público.

### 3. En cada móvil

1. Abre la dirección de Pages y elige quién eres.
2. Escribe la palabra clave. Solo se pide una vez por móvil.
3. Añade la app a la pantalla de inicio:
   - **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* / *Instalar aplicación*.
   - **iPhone (Safari):** botón Compartir → *Añadir a pantalla de inicio*.

### 4. Importar datos anteriores

**Ajustes → Copia de seguridad → Importar** acepta un archivo `.json` con este formato (el mismo que genera *Exportar*):

```json
{
  "gastos": [
    { "fecha": "2026-01-15", "concepto": "Luz", "importe": 44.07, "pagador": "Adri", "categoria": "Luz", "nota": "" }
  ],
  "presupuesto": [
    { "desde": "2026-01", "categoria": "Luz", "importe": 70 }
  ]
}
```

## Sin conexión

La app guarda una copia en el móvil. Lo que se apunte sin cobertura queda pendiente y se envía solo al recuperar la conexión.

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css`, `app.js` | La app, sin dependencias ni compilación |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalación y uso sin conexión |
| `apps-script/Code.gs` | La API que se pega en la hoja de Google |
