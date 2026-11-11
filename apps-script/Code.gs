/**
 * Gastos_S&A — API mínima sobre Google Sheets.
 *
 * La hoja de cálculo es la base de datos: una pestaña "Gastos" y otra "Presupuesto",
 * que se crean solas la primera vez. La app lee y escribe con POST, enviando la palabra clave.
 * Instrucciones de instalación en el README del repositorio.
 */

var HOJA_GASTOS = 'Gastos';
var HOJA_PRESU = 'Presupuesto';
var COLS_G = ['id', 'fecha', 'concepto', 'importe', 'pagador', 'categoria', 'nota', 'modificado'];
var COLS_P = ['desde', 'categoria', 'importe'];

function doGet() {
  return salida_({ ok: false, error: 'Esta dirección solo la usa la app.' });
}

function doPost(e) {
  var body = null;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return salida_({ ok: false, error: 'JSON no válido' });
  }
  if (!autorizado_(body)) {
    Utilities.sleep(1500); // frena a quien intente adivinarla
    return salida_({ ok: false, error: 'clave' });
  }
  return responder_(body);
}

/* ---------- palabra clave ---------- */
// Se guarda en Configuración del proyecto → Propiedades de la secuencia de comandos,
// con el nombre CLAVE. No está en el código. Si no existe, no se deja pasar a nadie.

function limpia_(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function autorizado_(body) {
  var clave = limpia_(PropertiesService.getScriptProperties().getProperty('CLAVE'));
  return clave.length > 0 && limpia_(body && body.clave) === clave;
}

function responder_(body) {
  var lock = LockService.getScriptLock();
  var out;
  try {
    lock.waitLock(20000);
    var d = leer_();
    var ops = (body && body.ops) || [];
    for (var i = 0; i < ops.length; i++) aplicar_(d, ops[i]);
    if (ops.length || d.sucio) escribir_(d);
    out = { ok: true, gastos: d.gastos, presupuesto: d.presupuesto };
  } catch (err) {
    out = { ok: false, error: String(err) };
  } finally {
    try { lock.releaseLock(); } catch (err2) {}
  }
  return salida_(out);
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- lectura ---------- */

function hoja_(nombre, cols, colTexto) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    h.setFrozenRows(1);
    h.getRange(colTexto + ':' + colTexto).setNumberFormat('@');
  }
  return h;
}

function filas_(h, n) {
  var last = h.getLastRow();
  return last < 2 ? [] : h.getRange(2, 1, last - 1, n).getValues();
}

function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function pad_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Devuelve la fecha como texto AAAA-MM-DD aunque en la hoja se haya escrito a mano. */
function fecha_(v) {
  if (esFecha_(v)) {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + pad_(Number(m[2])) + '-' + pad_(Number(m[1]));
  return s;
}

function mes_(v) {
  return fecha_(v).substring(0, 7);
}

function num_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/[^\d,.\-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function leer_() {
  var d = { gastos: [], presupuesto: [], sucio: false };

  var fg = filas_(hoja_(HOJA_GASTOS, COLS_G, 'B'), COLS_G.length);
  for (var i = 0; i < fg.length; i++) {
    var r = fg[i];
    if (r[1] === '' && r[2] === '' && r[3] === '') continue;
    var id = String(r[0]).trim();
    if (!id) { id = Utilities.getUuid(); d.sucio = true; } // fila añadida a mano
    d.gastos.push({
      id: id,
      fecha: fecha_(r[1]),
      concepto: String(r[2]).trim(),
      importe: num_(r[3]),
      pagador: String(r[4]).trim(),
      categoria: String(r[5]).trim(),
      nota: String(r[6]).trim(),
      modificado: esFecha_(r[7]) ? r[7].toISOString() : String(r[7])
    });
  }

  var fp = filas_(hoja_(HOJA_PRESU, COLS_P, 'A'), COLS_P.length);
  for (var j = 0; j < fp.length; j++) {
    var p = fp[j];
    if (p[0] === '' || p[1] === '') continue;
    d.presupuesto.push({ desde: mes_(p[0]), categoria: String(p[1]).trim(), importe: num_(p[2]) });
  }
  return d;
}

/* ---------- escritura ---------- */

function aplicar_(d, op) {
  if (!op || !op.t) return;
  if (op.t === 'put' && op.g && op.g.id) {
    var g = {
      id: String(op.g.id),
      fecha: String(op.g.fecha || ''),
      concepto: String(op.g.concepto || ''),
      importe: num_(op.g.importe),
      pagador: String(op.g.pagador || ''),
      categoria: String(op.g.categoria || ''),
      nota: String(op.g.nota || ''),
      modificado: String(op.g.modificado || new Date().toISOString())
    };
    for (var i = 0; i < d.gastos.length; i++) {
      if (d.gastos[i].id === g.id) { d.gastos[i] = g; return; }
    }
    d.gastos.push(g);
  } else if (op.t === 'del') {
    d.gastos = d.gastos.filter(function (x) { return x.id !== op.id; });
  } else if (op.t === 'budget' && op.desde) {
    d.presupuesto = d.presupuesto.filter(function (x) { return x.desde !== op.desde; });
    (op.items || []).forEach(function (it) {
      if (it.categoria) {
        d.presupuesto.push({ desde: String(op.desde), categoria: String(it.categoria), importe: num_(it.importe) });
      }
    });
  }
}

function volcar_(nombre, cols, colTexto, filas) {
  var h = hoja_(nombre, cols, colTexto);
  var last = h.getLastRow();
  if (last > 1) h.getRange(2, 1, last - 1, cols.length).clearContent();
  h.getRange(colTexto + ':' + colTexto).setNumberFormat('@');
  if (filas.length) h.getRange(2, 1, filas.length, cols.length).setValues(filas);
}

function escribir_(d) {
  d.gastos.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  volcar_(HOJA_GASTOS, COLS_G, 'B', d.gastos.map(function (g) {
    return COLS_G.map(function (c) { return g[c]; });
  }));

  d.presupuesto.sort(function (a, b) { return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0; });
  volcar_(HOJA_PRESU, COLS_P, 'A', d.presupuesto.map(function (p) {
    return COLS_P.map(function (c) { return p[c]; });
  }));
}
