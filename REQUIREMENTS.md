# Requisitos

Qué tiene que hacer Gastos S&A y qué se decidió dejar fuera. Sustituye a la hoja de Excel que se usaba antes; los cálculos deben dar lo mismo que daba ella.

## Contexto

Dos personas comparten los gastos de casa. Hay una cuenta bancaria común en la que cada mes ingresa cada uno la mitad de un presupuesto fijo. A veces uno paga algo común con su propio dinero; eso se apunta y se le descuenta de su ingreso del mes siguiente.

La app la usan los dos desde su móvil, uno con Android y otra con iPhone.

## Reglas de negocio

| N.º | Regla |
|---|---|
| R1 | El presupuesto mensual es una lista de partidas con importe. Su suma es el total del mes. |
| R2 | El reparto es siempre 50/50: la parte de cada uno es la mitad del total. |
| R3 | A mano solo se apuntan los gastos que alguien adelanta de su bolsillo. Lo que se paga desde la cuenta común llega con el extracto del banco (R9). |
| R4 | La aportación de una persona en un mes es su parte menos lo que adelantó el mes anterior. |
| R5 | Si la aportación sale negativa, la común le debe ese importe. Se arregla fuera de la app y no se arrastra al mes siguiente. |
| R6 | Lo adelantado en diciembre se descuenta en enero del año siguiente. |
| R7 | El presupuesto puede cambiar a partir de un mes concreto. Los meses anteriores conservan el que tenían. |
| R8 | El gasto real de un mes es lo que sale de los bolsillos de los dos: sus aportaciones más lo adelantado ese mes. |
| R9 | Los movimientos del banco solo sirven para analizar. Nunca cambian lo que ingresa cada uno (R4). |
| R10 | Lo gastado de verdad en un mes es lo que salió de la común más lo adelantado ese mes. Las devoluciones restan. Lo marcado «No contar» (ingresos en la común, traspasos, devoluciones de adelantos) queda fuera. |

## Funciones

### Adelantos
- F1. Apuntar un gasto adelantado con importe, concepto, quién lo pagó, categoría, fecha y nota opcional.
- F2. Por defecto paga quien usa el móvil y la fecha es la de hoy.
- F3. Editar y eliminar cualquier gasto, lo haya apuntado quien lo haya apuntado.
- F4. Ver los adelantos por mes, con el total adelantado por cada uno.
- F5. Buscar en todos los adelantos por concepto, categoría, nota o persona.

### Banco
- F24. Importar en Ajustes el extracto en CSV de la cuenta común (Revolut): todo 2026 y después un mes natural cada vez.
- F25. Reimportar un extracto, o que lo importen los dos, no duplica movimientos ni cambia categorías ya puestas.
- F26. Solo se guardan fecha, concepto, tipo e importe. Se descartan los movimientos pendientes o revertidos, los de otra divisa y los de la cuenta de ahorro.
- F27. Al importar, cada movimiento recibe categoría por las reglas guardadas o, si no hay regla, porque su concepto ya se clasificó antes o contiene el nombre de una partida. El dinero que entra se marca «No contar», salvo las devoluciones de compras.
- F28. Lo que queda sin categoría se revisa agrupado por comercio, de mayor a menor importe. Elegir categoría crea una regla («los que contengan este texto»), compartida entre los dos móviles.
- F29. Ver los movimientos por mes y buscarlos, en la pestaña Adelantos con el selector Adelantos / Banco. Tocando uno se cambia su categoría.
- F30. Ver y quitar reglas en Ajustes.

### Categorías
- F6. Las partidas del presupuesto son las categorías habituales.
- F7. Se puede escribir a mano cualquier otra categoría; no es una lista cerrada.
- F8. La app sugiere la categoría a partir del concepto, y la sugerencia se puede cambiar.

### Resumen del mes
- F9. Al abrir, se ve cuánto tiene que ingresar cada uno en la común este mes y de dónde sale la cifra.
- F10. Se ve lo adelantado en el mes en curso y lo que tocará ingresar el mes siguiente.

### Análisis
- F11. Gasto real medio al mes, por año, con dos cifras: lo que sale de los bolsillos (R8) y lo gastado de verdad (R10), y cuánto acumula o pierde la común.
- F12. Total adelantado por cada uno y su porcentaje.
- F13. Gráfico de lo adelantado cada mes, separado por persona.
- F14. Media mensual por categoría, sumando la común y los adelantos, comparada con su partida del presupuesto. Avisa de los meses sin extracto.
- F15. Tablas anuales con la aportación de cada uno y con el gasto real de cada mes (de los bolsillos y gastado).

### Presupuesto
- F16. Crear y modificar las partidas desde la app, eligiendo desde qué mes se aplican.

### Datos
- F17. Los datos se guardan en una hoja de Google propia, legible y editable a mano.
- F18. Lo que se cambie a mano en la hoja aparece en la app.
- F19. Exportar todo a un archivo e importar una copia, movimientos del banco y reglas incluidos.
- F20. Importar el histórico de 2026 del Excel.

### Diseño
- F21. Elegir el modo: el del sistema, claro u oscuro.
- F22. Elegir el estilo visual entre «Pastel», «Neón» y «Ochentas». Todos funcionan en claro y en oscuro.
- F23. Modo y estilo son de cada móvil: lo que elige uno no cambia lo que ve el otro, y se conservan al cerrar la app.

## Requisitos no funcionales

- **Multiplataforma**: una sola web instalable en la pantalla de inicio, sin tiendas de aplicaciones.
- **Sin coste**: alojamiento y base de datos gratuitos, sin marcas de agua ni publicidad.
- **Sin conexión**: la app abre y permite apuntar gastos sin cobertura; se envían al recuperarla.
- **Acceso**: sin cuentas ni inicio de sesión. Cada móvil indica quién lo usa una vez y escribe una palabra clave compartida una vez.
- **Privacidad**: el repositorio es público, así que no contiene gastos, importes ni la palabra clave.
- **Diseño**: elegante y cuidado, con colores pastel o mate, en claro y oscuro. Es un requisito de primer orden, no un adorno. En Ajustes cada uno elige en su móvil el modo (el del sistema, claro u oscuro) y el estilo: «Pastel», el original, «Neón», futurista, con verdes y azules de neón y detalles en rosa, u «Ochentas», estridente y muy colorido a propósito.
- **Navegación**: cuatro pestañas (Inicio, Adelantos, Análisis y Ajustes) en la barra inferior. También se pasa de una a la vecina deslizando el dedo en horizontal, con la página siguiendo al dedo como en una app nativa.
- **Idioma**: español, con importes en euros y formato español.
- **Mantenimiento**: sin dependencias ni compilación, para que cualquier cambio sea editar un archivo y fusionar.

## Fuera de alcance

Decidido expresamente; no añadir sin preguntar.

- Apuntar a mano gastos pagados desde la cuenta común: solo entran con el extracto.
- Dividir un movimiento del banco entre dos categorías.
- Extractos de otros bancos o conexión directa con el banco.
- Repartos distintos del 50/50 o gastos de una sola persona.
- Gastos recurrentes automáticos: se apuntan a mano cada mes.
- Gastos fraccionados en varios meses: se apunta cada parte a mano.
- Marcar un mes como liquidado.
- Fotos de tickets.
- Histórico anterior a 2026. De 2025 solo hay un apunte resumen por persona con lo adelantado en diciembre, para que enero de 2026 cuadre.
- Aportaciones extraordinarias a la común.
- Arrastre automático de saldos negativos.
- Más de dos personas.

## Diferencias con el Excel original

- **Gasto mensual**: el Excel sumaba el presupuesto y lo adelantado, contando dos veces lo adelantado. La app aplica R8.
- **Fechas**: el Excel solo miraba el número de mes, así que una fecha con el año equivocado pasaba desapercibida. La app usa la fecha completa.
- **Categorías**: el Excel no las tenía. Las del histórico se asignaron por el concepto y pueden contener errores.

## Pendiente de comprobar

- Uso real en iPhone como app instalada: que la palabra clave y los datos locales se conserven.
- Comportamiento del script en Google con dos móviles escribiendo a la vez.
- Revisión de las categorías asignadas al histórico.
- Importación con extractos reales de Revolut: solo se ha probado con la cabecera real y movimientos inventados. Los nombres exactos de los tipos (recargas, reembolsos) pueden variar.
- Los estilos «Neón» y «Ochentas» en los móviles reales: solo se han revisado en capturas a 390 px de ancho.
- En «Neón», los colores de persona (cian y magenta) se distinguen con daltonismo peor que los de los otros dos estilos, sobre todo en claro. Si molesta, cambiar el par.
