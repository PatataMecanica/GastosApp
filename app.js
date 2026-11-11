'use strict';

/* ============================================================
   Gastos S&A — gastos compartidos
   Los datos viven en una hoja de Google (ver apps-script/Code.gs).
   Aquí se guarda una copia local para que funcione sin conexión.
   ============================================================ */

const PEOPLE = ['Adri', 'Stephy'];
const KEY = 'gastos_sa';
// Dirección de la hoja (Apps Script). Sin la palabra clave, que solo está en Google y en cada móvil, no responde.
const API = 'https://script.google.com/macros/s/AKfycbyFACWln9Fn4nlZXXivxa2mYFnR--8yLpWkKGVsfAE6AFLErApynMApFYPsKpraEfEu/exec';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = a => a.reduce((t, n) => t + n, 0);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/* ---------- estado ---------- */
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* copia local ilegible */ }
const S = Object.assign({ me: '', clave: '', gastos: [], presupuesto: [], queue: [], lastSync: 0, tema: 'auto', estilo: 'pastel' }, saved);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento */ } };

/* ---------- diseño: modo y estilo ----------
   Son preferencias de este móvil: se guardan con el resto del estado local y no viajan a la hoja. */
const TEMAS = { auto: 'Sistema', light: 'Claro', dark: 'Oscuro' };
const ESTILOS = { pastel: 'Pastel', neon: 'Neón', retro: 'Ochentas' };
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyDesign() {
  if (!TEMAS[S.tema]) S.tema = 'auto';
  if (!ESTILOS[S.estilo]) S.estilo = 'pastel';
  const root = document.documentElement;
  root.dataset.theme = S.tema === 'auto' ? (darkMq.matches ? 'dark' : 'light') : S.tema;
  root.dataset.style = S.estilo;
  // la barra del navegador y la de estado toman el color del fondo
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) $$('meta[name="theme-color"]').forEach(m => { m.content = bg; });
}
applyDesign();
darkMq.addEventListener?.('change', applyDesign);

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const thisYm = () => today().slice(0, 7);
const shiftYm = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const ui = { tab: 'inicio', month: thisYm(), year: thisYm().slice(0, 4), q: '', syncing: false, err: '' };

/* ---------- formato ---------- */
const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const eur = n => `${nf.format(Math.round(n * 100) / 100 + 0)} €`;
const eur0 = n => `${nf0.format(n)} €`;
const monthName = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
const monthLabel = ym => `${monthName(ym)} ${ym.slice(0, 4)}`;
const dayLabel = iso => {
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return isNaN(d) ? iso : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};
const parseAmount = s => {
  const n = parseFloat(String(s).replace(/\s|€/g, '').replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/* ---------- cálculo ---------- */
// Presupuesto vigente en un mes: la versión más reciente con "desde" <= mes.
function budgetVersion(ym) {
  let best = '', first = '';
  for (const r of S.presupuesto) {
    if (r.desde <= ym && r.desde > best) best = r.desde;
    if (!first || r.desde < first) first = r.desde;
  }
  return best || first;
}
const budgetItems = ym => { const v = budgetVersion(ym); return S.presupuesto.filter(r => r.desde === v); };
const budgetTotal = ym => sum(budgetItems(ym).map(r => r.importe));
const share = ym => budgetTotal(ym) / 2;

const ofMonth = ym => S.gastos.filter(g => g.fecha.startsWith(ym));
const advanced = (p, ym) => sum(ofMonth(ym).filter(g => g.pagador === p).map(g => g.importe));
// Lo que cada uno ingresa en la común: su mitad menos lo que adelantó el mes anterior.
const contribution = (p, ym) => share(ym) - advanced(p, shiftYm(ym, -1));
// Lo que sale realmente del bolsillo de los dos en un mes.
const realSpend = ym => sum(PEOPLE.map(p => contribution(p, ym) + advanced(p, ym)));

const firstYm = () => S.gastos.reduce((m, g) => (g.fecha && g.fecha.slice(0, 7) < m ? g.fecha.slice(0, 7) : m), thisYm());

/* ---------- categorías ---------- */
const KEYWORDS = {
  comida: ['compra', 'super', 'mercado', 'fruter', 'carne', 'carnicer', 'pescad', 'poller', 'charcuter', 'panader', 'bodega'],
  ocio: ['bar', 'cena', 'restaurante', 'pizza', 'burger', 'burguer', 'cine', 'hotel', 'airbnb', 'viaje', 'vuelo', 'regalo', 'concierto', 'entradas', 'taxi'],
  telefono: ['movil', 'internet', 'fibra', 'vodafone', 'digi', 'o2', 'movistar', 'orange'],
  luz: ['octopus', 'iberdrola', 'endesa', 'naturgy', 'electric'],
};
function categoriesFor(ym) {
  const out = budgetItems(ym).map(r => r.categoria);
  const freq = {};
  for (const g of S.gastos) if (g.categoria) freq[g.categoria] = (freq[g.categoria] || 0) + 1;
  Object.keys(freq).sort((a, b) => freq[b] - freq[a]).forEach(c => { if (!out.some(o => norm(o) === norm(c))) out.push(c); });
  return out;
}
function guessCategory(concepto, ym) {
  const c = norm(concepto);
  if (!c) return '';
  // 1) el mismo concepto ya se clasificó antes
  const prev = S.gastos.filter(g => g.categoria && norm(g.concepto) === c).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
  if (prev) return prev.categoria;
  // 2) el concepto contiene el nombre de una categoría ("Luz", "Agua"...)
  const cats = categoriesFor(ym);
  const byName = cats.find(k => new RegExp(`(^|\\W)${norm(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(c));
  if (byName) return byName;
  // 3) palabras clave habituales
  for (const [key, words] of Object.entries(KEYWORDS)) {
    if (words.some(w => c.includes(w))) { const hit = cats.find(k => norm(k) === key); if (hit) return hit; }
  }
  return '';
}

/* ---------- cambios y sincronización ---------- */
function applyLocal(op) {
  if (op.t === 'put') {
    const i = S.gastos.findIndex(g => g.id === op.g.id);
    if (i >= 0) S.gastos[i] = op.g; else S.gastos.push(op.g);
  } else if (op.t === 'del') {
    S.gastos = S.gastos.filter(g => g.id !== op.id);
  } else if (op.t === 'budget') {
    S.presupuesto = S.presupuesto.filter(r => r.desde !== op.desde)
      .concat(op.items.map(it => ({ desde: op.desde, categoria: it.categoria, importe: it.importe })));
  }
}
function mutate(...ops) {
  ops.forEach(op => { applyLocal(op); S.queue.push(op); });
  save(); render(); sync();
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function sync() {
  if (!S.clave || ui.syncing) return;
  ui.syncing = true; renderTop();
  const sending = S.queue.slice();
  try {
    // Sin cabeceras propias: así el navegador no hace "preflight", que Apps Script no admite.
    const res = await fetch(API, { method: 'POST', body: JSON.stringify({ clave: S.clave, ops: sending }), redirect: 'follow' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Respuesta no válida');
    S.queue = S.queue.slice(sending.length);
    S.gastos = data.gastos || [];
    S.presupuesto = data.presupuesto || [];
    S.queue.forEach(applyLocal); // cambios hechos mientras se enviaba
    S.lastSync = Date.now();
    ui.err = '';
    save();
  } catch (e) {
    ui.err = e.message === 'clave' ? 'Palabra clave incorrecta' : navigator.onLine ? 'No se pudo conectar con la hoja' : 'Sin conexión';
  }
  ui.syncing = false;
  if (ui.err === 'Palabra clave incorrecta' && S.lastSync) { S.clave = ''; save(); }
  if (!$('#sheet').hidden) renderTop(); else render();
  if (S.queue.length && !ui.err) sync();
}

/* ---------- componentes ---------- */
const who = p => `<span class="dot ${esc(p)}"></span>${esc(p)}`;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400);
}
function rowHtml(g, withDate) {
  const meta = [withDate ? dayLabel(g.fecha) : '', g.categoria || 'Sin categoría', g.nota].filter(Boolean).join(' · ');
  return `<button class="row" data-edit="${esc(g.id)}">
    <span class="av ${esc(g.pagador)}">${esc((g.pagador || '?')[0])}</span>
    <span class="txt"><div class="c">${esc(g.concepto || 'Sin concepto')}</div><div class="m">${esc(meta)}</div></span>
    <span class="amt">${eur(g.importe)}</span>
  </button>`;
}
const byDateDesc = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.modificado < b.modificado ? 1 : -1));

/* ---------- cabecera ---------- */
function renderTop() {
  const titles = { inicio: `Hola, ${S.me}`, gastos: 'Gastos', analisis: 'Análisis', ajustes: 'Ajustes' };
  let cls = '', txt = 'Al día';
  if (ui.syncing) { cls = 'busy'; txt = 'Sincronizando'; }
  else if (ui.err) { cls = 'err'; txt = ui.err; }
  else if (S.queue.length) { cls = 'pend'; txt = `${S.queue.length} pendiente${S.queue.length > 1 ? 's' : ''}`; }
  $('#top').innerHTML = S.me ? `<div><div class="eyebrow">Gastos S&amp;A</div><h1>${esc(titles[ui.tab])}</h1></div>
    <button class="sync ${cls}" id="syncbtn"><i></i>${esc(txt)}</button>` : '';
}

/* ---------- inicio ---------- */
function viewInicio() {
  const ym = thisYm(), prev = shiftYm(ym, -1), next = shiftYm(ym, 1);
  const other = PEOPLE.find(p => p !== S.me);
  const mine = contribution(S.me, ym), theirs = contribution(other, ym);
  const hasBudget = S.presupuesto.length > 0;
  const recent = S.gastos.slice().sort(byDateDesc).slice(0, 6);
  const big = n => { const [i, d] = nf.format(Math.abs(n)).split(','); return `${i}<small>,${d} €</small>`; };

  return `
    ${!hasBudget ? `<div class="card notice"><p>Aún no hay presupuesto. Créalo para calcular cuánto ingresa cada uno.</p><button class="btn sm" data-budget>Crear</button></div>` : ''}
    <div class="card hero">
      <div class="label">${esc(monthLabel(ym))}</div>
      <div class="big">${big(mine)}</div>
      <div class="sub">${mine < 0
        ? `La común te debe este importe: adelantaste más que tu parte.`
        : `Es lo que ingresas en la común este mes.`}<br>
        ${eur(share(ym))} de tu parte − ${eur(advanced(S.me, prev))} que adelantaste en ${esc(monthName(prev))}.</div>
    </div>
    <div class="duo">
      <div class="card mini"><div class="who">${who(other)}</div><div class="num">${eur(theirs)}</div>
        <div class="sub">${theirs < 0 ? 'le debe la común' : 'ingresa este mes'}</div></div>
      <div class="card mini"><div class="who">Entre los dos</div><div class="num">${eur(Math.max(mine, 0) + Math.max(theirs, 0))}</div>
        <div class="sub">entra en la común</div></div>
    </div>

    <div class="section"><h2>Adelantado en ${esc(monthName(ym))}</h2></div>
    <div class="duo">
      ${PEOPLE.map(p => `<div class="card mini"><div class="who">${who(p)}</div><div class="num">${eur(advanced(p, ym))}</div>
        <div class="sub">en ${esc(monthName(next))} ingresará ${eur(contribution(p, next))}</div></div>`).join('')}
    </div>

    <div class="section"><h2>Últimos gastos</h2>${recent.length ? `<button class="link" data-tab="gastos">Ver todos</button>` : ''}</div>
    <div class="list">${recent.length ? recent.map(g => rowHtml(g, true)).join('') : `<div class="empty">Todavía no hay gastos.<br>Pulsa + para apuntar el primero.</div>`}</div>`;
}

/* ---------- gastos ---------- */
function gastosListHtml() {
  const q = norm(ui.q);
  if (q) {
    const hits = S.gastos.filter(g => norm(`${g.concepto} ${g.categoria} ${g.nota} ${g.pagador}`).includes(q)).sort(byDateDesc);
    return hits.length
      ? `<div class="list"><div class="day">${hits.length} resultado${hits.length > 1 ? 's' : ''} · ${eur(sum(hits.map(g => g.importe)))}</div>${hits.map(g => rowHtml(g, true)).join('')}</div>`
      : `<div class="list"><div class="empty">Nada coincide con «${esc(ui.q)}».</div></div>`;
  }
  const items = ofMonth(ui.month).sort(byDateDesc);
  if (!items.length) return `<div class="list"><div class="empty">Sin gastos en ${esc(monthLabel(ui.month))}.</div></div>`;
  let html = '', last = '';
  for (const g of items) {
    if (g.fecha !== last) { html += `<div class="day">${esc(dayLabel(g.fecha))}</div>`; last = g.fecha; }
    html += rowHtml(g, false);
  }
  return `<div class="list">${html}</div>`;
}
function viewGastos() {
  return `
    <input class="search" id="q" type="search" placeholder="Buscar en todos los gastos" value="${esc(ui.q)}" autocomplete="off">
    <div id="monthpart" ${ui.q ? 'hidden' : ''}>
      <div class="monthnav">
        <button data-month="-1" aria-label="Mes anterior">‹</button>
        <h2>${esc(monthLabel(ui.month))}</h2>
        <button data-month="1" aria-label="Mes siguiente" ${ui.month >= shiftYm(thisYm(), 1) ? 'disabled' : ''}>›</button>
      </div>
      <div class="duo">
        ${PEOPLE.map(p => `<div class="card mini"><div class="who">${who(p)}</div><div class="num">${eur(advanced(p, ui.month))}</div><div class="sub">adelantado</div></div>`).join('')}
      </div>
    </div>
    <div id="glist">${gastosListHtml()}</div>`;
}

/* ---------- análisis ---------- */
function yearMonths(year) {
  const now = thisYm(), first = firstYm();
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${pad(m)}`;
    if (ym >= first && ym <= now) out.push(ym);
  }
  return out;
}
function barsSvg(year) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const data = months.map(ym => PEOPLE.map(p => advanced(p, ym)));
  const max = Math.max(100, ...data.map(d => d[0] + d[1]));
  const step = [50, 100, 200, 250, 500, 1000, 2000, 5000].find(s => max / s <= 4) || 10000;
  const top = Math.ceil(max / step) * step;
  const W = 340, H = 190, L = 34, B = 20, T = 8, ph = H - B - T, cw = (W - L) / 12, bw = 12;
  const y = v => T + ph - (v / top) * ph;
  let s = '';
  for (let v = 0; v <= top; v += step) {
    s += `<line class="grid" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${nf0.format(v)}</text>`;
  }
  const roundTop = (x, y0, h, r) => {
    r = Math.min(r, h, bw / 2);
    return `M${x},${y0 + h}V${y0 + r}a${r},${r} 0 0 1 ${r},${-r}h${bw - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${y0 + h}Z`;
  };
  months.forEach((ym, i) => {
    const [a, b] = data[i];
    const x = L + i * cw + (cw - bw) / 2;
    const ha = (a / top) * ph, hb = (b / top) * ph;
    const gap = a > 0 && b > 0 ? 2 : 0;
    s += `<rect class="hit" data-i="${i}" x="${L + i * cw}" y="${T}" width="${cw}" height="${ph}" rx="6"/>`;
    if (a > 0) s += b > 0 ? `<rect class="sa" x="${x}" y="${y(a)}" width="${bw}" height="${ha}" pointer-events="none"/>`
      : `<path class="sa" d="${roundTop(x, y(a), ha, 4)}" pointer-events="none"/>`;
    if (b > 0) s += `<path class="sb" d="${roundTop(x, y(a + b), Math.max(hb - gap, 1), 4)}" pointer-events="none"/>`;
    s += `<text x="${L + i * cw + cw / 2}" y="${H - 5}" text-anchor="middle">${monthName(ym)[0].toUpperCase()}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Adelantado por mes en ${year}">${s}</svg>`;
}
function readoutHtml(year, i) {
  if (i == null) return `Toca un mes para ver el detalle.`;
  const ym = `${year}-${pad(i + 1)}`;
  const [a, b] = PEOPLE.map(p => advanced(p, ym));
  return `<b style="text-transform:capitalize">${esc(monthLabel(ym))}</b> · ${eur(a + b)}<br>${PEOPLE[0]} ${eur(a)} · ${PEOPLE[1]} ${eur(b)}`;
}
function viewAnalisis() {
  const years = [...new Set(S.gastos.map(g => g.fecha.slice(0, 4)).concat(thisYm().slice(0, 4)))].sort();
  if (!years.includes(ui.year)) ui.year = years[years.length - 1];
  const year = ui.year, months = yearMonths(year), n = Math.max(months.length, 1);
  const ofYear = S.gastos.filter(g => g.fecha.startsWith(year));
  const tot = PEOPLE.map(p => sum(ofYear.filter(g => g.pagador === p).map(g => g.importe)));
  const total = tot[0] + tot[1];
  const avgReal = months.length ? sum(months.map(realSpend)) / n : 0;
  const refYm = months[months.length - 1] || `${year}-12`;

  // por categoría: media mensual adelantada frente al presupuesto mensual
  const cats = {};
  for (const g of ofYear) { const k = g.categoria || 'Sin categoría'; cats[k] = (cats[k] || 0) + g.importe; }
  const budget = {};
  for (const r of budgetItems(refYm)) { budget[r.categoria] = r.importe; if (!(r.categoria in cats)) cats[r.categoria] = 0; }
  const rows = Object.keys(cats).map(k => ({ k, avg: cats[k] / n, total: cats[k], bud: budget[k] })).sort((a, b) => b.avg - a.avg);
  const scale = Math.max(1, ...rows.map(r => Math.max(r.avg, r.bud || 0)));

  return `
    <div class="pills">${years.map(y => `<button class="pill ${y === year ? 'on' : ''}" data-year="${y}">${y}</button>`).join('')}</div>
    <div class="kpis">
      <div class="card kpi wide"><div class="label">Gasto real medio al mes</div><div class="num">${eur(avgReal)}</div>
        <div class="sub">Lo que sale de vuestros bolsillos: aportaciones a la común más lo adelantado. Presupuesto: ${eur(budgetTotal(refYm))}.</div></div>
      ${PEOPLE.map((p, i) => `<div class="card kpi"><div class="mini"><div class="who">${who(p)}</div></div><div class="num">${eur0(tot[i])}</div>
        <div class="sub">adelantado · ${total ? Math.round(tot[i] / total * 100) : 0} %</div></div>`).join('')}
    </div>

    <div class="card">
      <h2>Adelantado cada mes</h2>
      <div class="legend">${PEOPLE.map(p => `<span>${who(p)}</span>`).join('')}</div>
      <div class="readout" id="readout">${readoutHtml(year, null)}</div>
      ${barsSvg(year)}
    </div>

    <div class="card">
      <h2>Por categoría</h2>
      <div class="sub">Media mensual adelantada. La marca es el presupuesto.</div>
      <div style="margin-top:8px">
      ${rows.length ? rows.map(r => `<div class="cat">
          <div class="top"><b>${esc(r.k)}</b><span>${eur0(r.avg)}${r.bud != null ? ` / ${eur0(r.bud)}` : ''}</span></div>
          <div class="track"><div class="fill" style="width:${(r.avg / scale * 100).toFixed(1)}%"></div>
            ${r.bud != null ? `<div class="tick" style="left:calc(${(r.bud / scale * 100).toFixed(1)}% - 1px)"></div>` : ''}</div>
          ${r.bud != null && r.avg > r.bud + 0.5 ? `<div class="over">▲ ${eur0(r.avg - r.bud)} por encima del presupuesto</div>` : ''}
        </div>`).join('') : `<div class="empty">Sin datos este año.</div>`}
      </div>
      <div class="foot">Solo cuenta lo adelantado por cada uno; lo que se paga directamente desde la común no se apunta.</div>
    </div>

    <div class="card">
      <h2>Aportaciones a la común</h2>
      <table class="year">
        <tr><th>Mes</th>${PEOPLE.map(p => `<th>${esc(p)}</th>`).join('')}<th>Gasto real</th></tr>
        ${months.map(ym => `<tr class="${ym === thisYm() ? 'now' : ''}"><td>${esc(monthName(ym))}</td>
          ${PEOPLE.map(p => { const c = contribution(p, ym); return `<td class="${c < 0 ? 'neg' : ''}">${nf.format(c)}</td>`; }).join('')}
          <td>${nf.format(realSpend(ym))}</td></tr>`).join('') || `<tr><td colspan="4" class="empty">Sin datos.</td></tr>`}
      </table>
    </div>`;
}

/* ---------- ajustes ---------- */
function viewAjustes() {
  const ym = thisYm(), items = budgetItems(ym);
  const versions = [...new Set(S.presupuesto.map(r => r.desde))].sort();
  return `
    <div class="card">
      <h2>¿Quién eres?</h2>
      <div class="sub" style="margin-bottom:12px">Se usa para marcar quién paga por defecto.</div>
      <div class="segm">${PEOPLE.map(p => `<button class="${S.me === p ? 'on' : ''}" data-me="${p}">${who(p)}</button>`).join('')}</div>
    </div>

    <div class="card">
      <h2>Diseño</h2>
      <div class="sub">Cómo se ve la app en este móvil.</div>
      <span class="fl">Modo</span>
      <div class="segm three">${Object.entries(TEMAS).map(([k, n]) => `<button class="${S.tema === k ? 'on' : ''}" data-tema="${k}" aria-pressed="${S.tema === k}">${n}</button>`).join('')}</div>
      <span class="fl">Estilo</span>
      <div class="segm three styles">${Object.entries(ESTILOS).map(([k, n]) => `<button class="${S.estilo === k ? 'on' : ''}" data-estilo="${k}" aria-pressed="${S.estilo === k}"><i class="sw ${k}"></i>${n}</button>`).join('')}</div>
    </div>

    <div class="card">
      <h2>Presupuesto mensual</h2>
      <div class="sub">${versions.length ? `Vigente desde ${esc(monthLabel(budgetVersion(ym)))}.` : 'Aún no hay presupuesto.'}</div>
      <div style="margin-top:8px">
        ${items.map(r => `<div class="kv"><span>${esc(r.categoria)}</span><span>${eur(r.importe)}</span></div>`).join('')}
        ${items.length ? `<div class="kv total"><span>Total</span><span>${eur(budgetTotal(ym))}</span></div>
        <div class="kv"><span>A la común, cada uno</span><span>${eur(share(ym))}</span></div>` : ''}
      </div>
      <div class="btns"><button class="btn sm" data-budget>${items.length ? 'Cambiar presupuesto' : 'Crear presupuesto'}</button></div>
      ${versions.length > 1 ? `<div class="foot">Historial: ${versions.map(v => `${esc(monthLabel(v))} (${eur0(sum(S.presupuesto.filter(r => r.desde === v).map(r => r.importe)))})`).join(' → ')}</div>` : ''}
    </div>

    <div class="card">
      <h2>Hoja de Google</h2>
      <div class="sub">${ui.err ? esc(ui.err) + '.' : S.lastSync ? `Conectada. Última sincronización: ${new Date(S.lastSync).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.` : 'Pendiente de la primera sincronización.'}</div>
      <div class="btns">
        <button class="btn sm ghost" id="syncnow">Sincronizar ahora</button>
        <button class="btn sm ghost" id="changekey">Cambiar palabra clave</button>
      </div>
    </div>

    <div class="card">
      <h2>Copia de seguridad</h2>
      <div class="sub">Exporta todo a un archivo o importa una copia. Al importar, los gastos se añaden a los que ya haya.</div>
      <div class="btns">
        <button class="btn sm ghost" id="export">Exportar</button>
        <button class="btn sm ghost" id="import">Importar</button>
        <input type="file" id="importfile" accept=".json,application/json" hidden>
      </div>
    </div>`;
}

/* ---------- render ---------- */
function viewWelcome() {
  return `<div class="welcome">
    <div class="logo">Gastos <em>S&amp;A</em></div>
    <p>Los gastos de casa, a medias y sin cuentas raras.<br>¿Quién va a usar este móvil?</p>
    <div class="who">${PEOPLE.map(p => `<button data-me="${p}">${who(p)}</button>`).join('')}</div>
  </div>`;
}
function viewKey() {
  return `<div class="welcome">
    <div class="logo">Gastos <em>S&amp;A</em></div>
    <p>Escribe la palabra clave para conectar con vuestra hoja.<br>Solo se pide una vez en este móvil.</p>
    <form id="fk" autocomplete="off">
      <input class="field" id="k-clave" type="password" placeholder="Palabra clave" autocapitalize="off" autocorrect="off" spellcheck="false" style="text-align:center">
      <div class="btns"><button class="btn block" type="submit">Entrar</button></div>
    </form>
  </div>`;
}
async function submitKey() {
  const clave = $('#k-clave').value.trim();
  if (!clave) return toast('Escribe la palabra clave');
  const btn = $('#fk button'); btn.disabled = true; btn.textContent = 'Comprobando…';
  S.clave = clave; ui.err = '';
  await sync();
  if (ui.err === 'Palabra clave incorrecta') { S.clave = ''; ui.err = ''; save(); render(); return toast('Palabra clave incorrecta'); }
  save(); render();
  if (ui.err) toast('Sin conexión: se comprobará al recuperarla');
}
function render() {
  const ready = S.me && S.clave;
  if (ready) renderTop(); else $('#top').innerHTML = '';
  $('#nav').hidden = !ready;
  if (!S.me) { $('#view').innerHTML = viewWelcome(); return; }
  if (!S.clave) { if (!$('#fk')) $('#view').innerHTML = viewKey(); return; }
  $$('#nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#view').innerHTML = { inicio: viewInicio, gastos: viewGastos, analisis: viewAnalisis, ajustes: viewAjustes }[ui.tab]();
}
function go(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }

/* ---------- hoja: gasto ---------- */
function openSheet(html) {
  const card = $('.sheet-card'), body = $('.sheet-body');
  card.style.transition = card.style.transform = $('.sheet-bg').style.opacity = '';
  body.innerHTML = html; $('#sheet').hidden = false; body.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; render(); }

// Arrastrar la hoja hacia abajo para cerrarla, desde el asa o desde el contenido
// cuando está arriba del todo. De paso evita que la página de fondo o la propia
// hoja se muevan «con goma» en iOS.
{
  const sheet = $('#sheet'), card = $('.sheet-card'), body = $('.sheet-body'), bg = $('.sheet-bg');
  let t0 = null; // { x, y, time, mode: null | 'drag' | 'scroll', grab, inBody }
  const settle = (y, done) => {
    card.style.transition = 'transform .2s cubic-bezier(.2, .8, .2, 1)';
    bg.style.transition = 'opacity .2s';
    card.style.transform = y ? `translateY(${y}px)` : '';
    bg.style.opacity = y ? '0' : '';
    setTimeout(() => { card.style.transition = bg.style.transition = ''; done && done(); }, 210);
  };
  sheet.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { t0 = null; return; }
    const p = e.touches[0];
    t0 = { x: p.clientX, y: p.clientY, time: e.timeStamp, mode: null, dy: 0, grab: !!e.target.closest('.sheet-grab'), inBody: !!e.target.closest('.sheet-body') };
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!t0) return;
    const p = e.touches[0], dx = p.clientX - t0.x, dy = p.clientY - t0.y;
    if (!t0.mode) {
      if (!dx && !dy) return;
      const down = dy > 0 && Math.abs(dy) >= Math.abs(dx);
      const canScroll = t0.inBody && body.scrollHeight > body.clientHeight + 1;
      if (t0.grab || (t0.inBody && down && body.scrollTop <= 0)) t0.mode = 'drag';
      else if (canScroll && Math.abs(dy) > Math.abs(dx)) t0.mode = 'scroll';
      else t0.mode = 'none';
    }
    if (t0.mode === 'scroll') return;
    if (e.cancelable) e.preventDefault();
    if (t0.mode !== 'drag') return;
    t0.dy = Math.max(0, dy);
    card.style.transition = 'none';
    card.style.transform = `translateY(${t0.dy}px)`;
    bg.style.opacity = String(Math.max(0, 1 - t0.dy / card.offsetHeight));
  }, { passive: false });
  const end = e => {
    if (!t0 || t0.mode !== 'drag') { t0 = null; return; }
    const dy = t0.dy, fast = dy > 30 && dy / Math.max(1, e.timeStamp - t0.time) > .6;
    t0 = null;
    if (e.type === 'touchend' && (fast || dy > Math.min(140, card.offsetHeight / 3))) {
      document.activeElement?.blur?.();
      settle(card.offsetHeight, () => { if (!sheet.hidden) closeSheet(); });
    } else settle(0);
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

let form = null;
function openGasto(id) {
  const g = id ? S.gastos.find(x => x.id === id) : null;
  form = g ? { ...g, auto: false } : { id: '', fecha: ui.tab === 'gastos' && ui.month !== thisYm() ? `${ui.month}-01` : today(), concepto: '', importe: '', pagador: S.me, categoria: '', nota: '', auto: true };
  const concepts = [...new Set(S.gastos.slice().sort(byDateDesc).map(x => x.concepto.trim()).filter(Boolean))].slice(0, 80);
  openSheet(`
    <h2>${g ? 'Editar gasto' : 'Nuevo gasto'}</h2>
    <form id="fg" autocomplete="off">
      <div class="amount"><input id="f-imp" inputmode="decimal" placeholder="0,00" value="${g ? esc(nf.format(g.importe).replace(/\./g, '')) : ''}" aria-label="Importe"></div>
      <div class="amount-unit">euros</div>
      <label class="fl" for="f-con">Concepto</label>
      <input class="field" id="f-con" list="concepts" placeholder="Luz, compra, cena…" value="${esc(form.concepto)}">
      <datalist id="concepts">${concepts.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <label class="fl">Lo ha pagado</label>
      <div class="segm" id="f-pag"></div>
      <label class="fl">Categoría</label>
      <div class="chips" id="f-cat"></div>
      <input class="field" id="f-otra" placeholder="Nombre de la categoría" style="margin-top:10px" hidden>
      <label class="fl" for="f-fec">Fecha</label>
      <input class="field" id="f-fec" type="date" value="${esc(form.fecha)}">
      <label class="fl" for="f-not">Nota (opcional)</label>
      <input class="field" id="f-not" value="${esc(form.nota)}">
      <div class="btns" style="margin-top:22px">
        <button class="btn block" type="submit">Guardar</button>
        ${g ? `<button class="btn danger block" type="button" id="f-del">Eliminar gasto</button>` : ''}
      </div>
    </form>`);
  paintForm();
  if (!g) setTimeout(() => $('#f-imp')?.focus(), 80);
}
function paintForm() {
  $('#f-pag').innerHTML = PEOPLE.map(p => `<button type="button" class="${form.pagador === p ? 'on' : ''}" data-pag="${p}">${who(p)}</button>`).join('');
  const cats = categoriesFor((form.fecha || today()).slice(0, 7));
  const known = cats.some(c => c === form.categoria);
  const other = form.other || (form.categoria && !known);
  $('#f-cat').innerHTML = cats.map(c => `<button type="button" class="chip ${!other && form.categoria === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')
    + `<button type="button" class="chip ${other ? 'on' : ''}" data-cat-other>Otra…</button>`;
  const o = $('#f-otra'); o.hidden = !other;
  if (other && document.activeElement !== o) o.value = form.categoria;
}
function submitGasto() {
  const importe = parseAmount($('#f-imp').value);
  const concepto = $('#f-con').value.trim();
  const fecha = $('#f-fec').value;
  if (!isFinite(importe) || importe === 0) return toast('Escribe el importe');
  if (!concepto) return toast('Escribe el concepto');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast('Elige la fecha');
  const g = {
    id: form.id || uid(), fecha, concepto, importe, pagador: form.pagador,
    categoria: (form.categoria || '').trim(), nota: $('#f-not').value.trim(), modificado: new Date().toISOString(),
  };
  const isNew = !form.id;
  $('#sheet').hidden = true; document.body.style.overflow = '';
  mutate({ t: 'put', g });
  toast(isNew ? 'Gasto apuntado' : 'Gasto actualizado');
}

/* ---------- hoja: presupuesto ---------- */
function openBudget() {
  const ym = thisYm();
  const items = budgetItems(ym);
  const rows = (items.length ? items : [{ categoria: '', importe: '' }]);
  openSheet(`
    <h2>Presupuesto mensual</h2>
    <p class="sub" style="color:var(--ink-2);font-size:14px;margin:6px 0 4px">Cada uno ingresa la mitad del total. Los meses anteriores al elegido conservan el presupuesto que tenían.</p>
    <form id="fb" autocomplete="off">
      <label class="fl" for="b-desde">Se aplica desde</label>
      <input class="field" id="b-desde" type="month" value="${ym}">
      <label class="fl">Partidas</label>
      <div id="b-rows">${rows.map(budgetRow).join('')}</div>
      <button class="btn sm ghost" type="button" id="b-add">Añadir partida</button>
      <div class="kv total" style="margin-top:14px"><span>Total</span><span id="b-total"></span></div>
      <div class="kv"><span>A la común, cada uno</span><span id="b-half"></span></div>
      <div class="btns" style="margin-top:16px"><button class="btn block" type="submit">Guardar presupuesto</button></div>
    </form>`);
  budgetTotals();
}
const budgetRow = r => `<div class="brow">
  <input class="field" placeholder="Partida" value="${esc(r.categoria)}" aria-label="Partida">
  <input class="field" inputmode="decimal" placeholder="0" value="${r.importe === '' ? '' : esc(String(r.importe).replace('.', ','))}" aria-label="Importe">
  <button type="button" class="x" data-brow-del aria-label="Quitar partida">×</button></div>`;
function readBudget() {
  return $$('#b-rows .brow').map(r => {
    const [c, i] = $$('input', r);
    return { categoria: c.value.trim(), importe: parseAmount(i.value) || 0 };
  }).filter(r => r.categoria);
}
function budgetTotals() {
  const t = sum(readBudget().map(r => r.importe));
  $('#b-total').textContent = eur(t); $('#b-half').textContent = eur(t / 2);
}
function submitBudget() {
  const items = readBudget();
  let desde = $('#b-desde').value;
  if (!/^\d{4}-\d{2}$/.test(desde)) return toast('Elige el mes (AAAA-MM)');
  if (!items.length) return toast('Añade al menos una partida');
  $('#sheet').hidden = true; document.body.style.overflow = '';
  mutate({ t: 'budget', desde, items });
  toast('Presupuesto guardado');
}

/* ---------- copia de seguridad ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'gastos-sa', exportado: new Date().toISOString(), gastos: S.gastos, presupuesto: S.presupuesto }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `gastos-sa-${today()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const gastos = (data.gastos || []).filter(g => g.fecha && isFinite(+g.importe));
    const versions = {};
    for (const r of data.presupuesto || []) if (r.desde && r.categoria) (versions[r.desde] = versions[r.desde] || []).push({ categoria: r.categoria, importe: +r.importe || 0 });
    if (!gastos.length && !Object.keys(versions).length) return toast('El archivo no contiene datos');
    if (!confirm(`Se van a importar ${gastos.length} gastos y ${Object.keys(versions).length} presupuesto(s). ¿Continuar?`)) return;
    const now = new Date().toISOString();
    mutate(
      ...gastos.map(g => ({ t: 'put', g: { id: g.id || uid(), fecha: String(g.fecha).slice(0, 10), concepto: String(g.concepto || '').trim(), importe: +g.importe, pagador: PEOPLE.includes(g.pagador) ? g.pagador : PEOPLE[0], categoria: String(g.categoria || '').trim(), nota: String(g.nota || '').trim(), modificado: g.modificado || now } })),
      ...Object.entries(versions).map(([desde, items]) => ({ t: 'budget', desde, items })),
    );
    toast('Importación completada');
  } catch { toast('No se pudo leer el archivo'); }
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-close]');
  if (!t) return;
  const d = t.dataset;
  if ('close' in d) return closeSheet();
  if (d.tab) return go(d.tab);
  if (t.id === 'fab') return openGasto();
  if (t.id === 'syncbtn' || t.id === 'syncnow') return void sync();
  if (d.edit) return openGasto(d.edit);
  if (d.me) { S.me = d.me; save(); render(); return; }
  if (d.tema) { S.tema = d.tema; save(); applyDesign(); render(); return; }
  if (d.estilo) { S.estilo = d.estilo; save(); applyDesign(); render(); return; }
  if (d.month) { ui.month = shiftYm(ui.month, +d.month); render(); return; }
  if (d.year) { ui.year = d.year; render(); return; }
  if ('budget' in d) return openBudget();

  // formulario de gasto
  if (d.pag) { form.pagador = d.pag; return paintForm(); }
  if (d.cat) { form.categoria = form.categoria === d.cat && !form.other ? '' : d.cat; form.other = false; form.auto = false; return paintForm(); }
  if ('catOther' in d) { form.other = !form.other; form.categoria = ''; form.auto = false; paintForm(); if (form.other) $('#f-otra').focus(); return; }
  if (t.id === 'f-del') {
    if (!confirm('¿Eliminar este gasto?')) return;
    const id = form.id; $('#sheet').hidden = true; document.body.style.overflow = '';
    mutate({ t: 'del', id }); return toast('Gasto eliminado');
  }

  // presupuesto
  if (t.id === 'b-add') { $('#b-rows').insertAdjacentHTML('beforeend', budgetRow({ categoria: '', importe: '' })); $$('#b-rows .brow input')[$$('#b-rows .brow').length * 2 - 2].focus(); return; }
  if ('browDel' in d) { t.closest('.brow').remove(); return budgetTotals(); }

  // ajustes
  if (t.id === 'changekey') {
    if (!confirm('Tendrás que volver a escribir la palabra clave en este móvil. ¿Continuar?')) return;
    S.clave = ''; ui.err = ''; save(); return render();
  }
  if (t.id === 'export') return exportData();
  if (t.id === 'import') return $('#importfile').click();
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { ui.q = t.value; $('#monthpart').hidden = !!ui.q; $('#glist').innerHTML = gastosListHtml(); }
  else if (t.id === 'f-con') {
    form.concepto = t.value;
    if (form.auto) { form.categoria = guessCategory(t.value, (form.fecha || today()).slice(0, 7)); paintForm(); }
  }
  else if (t.id === 'f-otra') { form.categoria = t.value; }
  else if (t.id === 'f-fec') { form.fecha = t.value; }
  else if (t.closest('#b-rows')) budgetTotals();
});
document.addEventListener('change', e => {
  if (e.target.id === 'importfile' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'fg') submitGasto();
  if (e.target.id === 'fb') submitBudget();
  if (e.target.id === 'fk') submitKey();
});
// detalle del gráfico al tocar o pasar por un mes
const pickBar = e => {
  const hit = e.target.closest?.('.chart .hit');
  if (!hit) return;
  $$('.chart .hit.on').forEach(h => h.classList.remove('on'));
  hit.classList.add('on');
  $('#readout').innerHTML = readoutHtml(ui.year, +hit.dataset.i);
};
document.addEventListener('pointerover', pickBar);
document.addEventListener('pointerdown', pickBar);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

/* ---------- arranque ---------- */
render();
sync();
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden) sync(); });
window.addEventListener('online', sync);
setInterval(() => { if (!document.hidden && $('#sheet').hidden) sync(); }, 60000);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
