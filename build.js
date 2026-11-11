'use strict';
/* =====================================================================
   Generador de la web de Guadarramaa.guidess
   - Lee los textos de la carpeta /content (JSON y Markdown).
   - Escribe la web terminada (HTML, CSS, JS, imágenes) en /dist.
   - No necesita instalar nada: solo Node.js.
   Uso:  node build.js
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const CT = path.join(ROOT, 'content');
const VERSION = Date.now().toString(36);
fs.rmSync(OUT, { recursive: true, force: true });

/* ---------- lectura de contenido ---------- */
function readJSON(rel, fallback) {
  const f = path.join(CT, rel);
  if (!fs.existsSync(f)) {
    if (fallback !== undefined) return fallback;
    throw new Error('Falta el archivo content/' + rel);
  }
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { throw new Error('El archivo content/' + rel + ' tiene un error de formato: ' + e.message); }
}
function parseFrontmatter(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: txt };
  const data = {}, lines = m[1].split(/\r?\n/);
  const unq = v => {
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length > 1)) return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    if ((v.startsWith("'") && v.endsWith("'") && v.length > 1)) return v.slice(1, -1).replace(/''/g, "'");
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  };
  for (let i = 0; i < lines.length; i++) {
    const k = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!k) continue;
    let v = k[2].trim();
    const cont = [];
    while (i + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[i + 1]) && !/^[A-Za-z_][\w-]*:/.test(lines[i + 1])) cont.push(lines[++i].trim());
    if (/^[>|][+-]?$/.test(v)) v = cont.join(v[0] === '|' ? '\n' : ' ').trim();
    else if (cont.length) v = unq((v + ' ' + cont.join(' ')).trim());
    else v = unq(v);
    data[k[1]] = v;
  }
  return { data, body: m[2] };
}
const AJ = readJSON('ajustes.json');
const PORT = readJSON('portada.json');
const NOS = readJSON('nosotros.json');
const SERV = readJSON('servicios.json');
const FAQ = readJSON('faq.json');
const GAL = readJSON('galeria.json');
const OPI = readJSON('opiniones.json');
/* Imagen de la página /opiniones/. Si falta el archivo content/opiniones-pagina.json se usa la foto inicial
   (src/img/uploads/opiniones-portada.jpg). Si el archivo existe, manda lo que ponga el panel (incluido «sin imagen»). */
const OPIP = fs.existsSync(path.join(CT, 'opiniones-pagina.json')) ? readJSON('opiniones-pagina.json')
  : (fs.existsSync(path.join(SRC, 'img', 'uploads', 'opiniones-portada.jpg')) ? { imagen: '/img/uploads/opiniones-portada.jpg', descripcion: 'Grupo de senderistas en una ruta de montaña, con nieve al fondo' } : {});
const SAL = readJSON('salidas.json');
const LEGAL = readJSON('legal.json');

const RUTAS = fs.readdirSync(path.join(CT, 'rutas')).filter(f => f.endsWith('.json')).map(f => {
  const r = readJSON('rutas/' + f);
  r.id = f.replace(/\.json$/, '');
  return r;
}).filter(r => r.publicada !== false)
  .sort((a, b) => (Number(a.orden) || 99) - (Number(b.orden) || 99) || String(a.titulo).localeCompare(String(b.titulo), 'es'));

const POSTS = fs.existsSync(path.join(CT, 'blog')) ? fs.readdirSync(path.join(CT, 'blog')).filter(f => f.endsWith('.md')).map(f => {
  const { data, body } = parseFrontmatter(fs.readFileSync(path.join(CT, 'blog', f), 'utf8'));
  return Object.assign({ slug: f.replace(/\.md$/, ''), body }, data);
}).filter(p => p.borrador !== true)
  .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))) : [];

/* ---------- utilidades de texto ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PROV_RE = /^\s*PROVISIONAL:\s*/i;
const isProv = s => PROV_RE.test(String(s || ''));
const stripProv = s => String(s || '').replace(PROV_RE, '').trim();
const has = v => v !== '' && v != null && !(Array.isArray(v) && !v.length);
const inline = s => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const ext = /^https?:/.test(u);
    return '<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
  });
/* Texto corto: vacío = «Por confirmar»; «PROVISIONAL: …» = texto provisional resaltado */
function T(s, label) {
  if (!has(s)) return '<span class="pend">' + (label || 'Por confirmar') + '</span>';
  if (isProv(s)) return '<mark class="prov">' + esc(stripProv(s)) + '</mark>';
  return esc(s);
}
/* Markdown sencillo para textos largos */
function md(s, opts) {
  opts = opts || {};
  if (!has(s)) return '<p><mark class="prov">Texto por escribir.</mark></p>';
  const blocks = String(s).replace(/\r/g, '').split(/\n{2,}/);
  return blocks.map(b => {
    b = b.trim(); if (!b) return '';
    const prov = isProv(b); if (prov) b = stripProv(b);
    const wrap = h => prov ? '<mark class="prov">' + h + '</mark>' : h;
    let m;
    if ((m = b.match(/^(#{1,4})\s+(.*)$/))) { const l = Math.min(4, m[1].length + (opts.shift || 1)); return '<h' + l + '>' + inline(m[2]) + '</h' + l + '>'; }
    if (/^([-*]\s+.*(\n|$))+$/.test(b)) return '<ul>' + b.split('\n').map(l => '<li>' + wrap(inline(l.replace(/^[-*]\s+/, ''))) + '</li>').join('') + '</ul>';
    if (/^(\d+\.\s+.*(\n|$))+$/.test(b)) return '<ol>' + b.split('\n').map(l => '<li>' + wrap(inline(l.replace(/^\d+\.\s+/, ''))) + '</li>').join('') + '</ol>';
    if ((m = b.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) return '<figure class="md-img"><img src="' + esc(m[2]) + '" alt="' + esc(m[1]) + '" loading="lazy"></figure>';
    return '<p>' + wrap(inline(b).replace(/\n/g, '<br>')) + '</p>';
  }).join('\n');
}
const fmtDate = (iso, long) => {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const slugOK = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

/* ---------- ajustes ---------- */
const NAME = AJ.nombre || 'Guadarramaa.guidess';
const BASE = String(AJ.url_sitio || process.env.URL || '').replace(/\/+$/, '');
let waNum = String(AJ.whatsapp || '').replace(/\D/g, '');
if (waNum.length === 9 && /^[6-9]/.test(waNum)) waNum = '34' + waNum;
const EMAIL = String(AJ.email || '').trim();
const waPretty = () => waNum.startsWith('34') && waNum.length === 11 ? '+34 ' + waNum.slice(2, 5) + ' ' + waNum.slice(5, 8) + ' ' + waNum.slice(8) : '+' + waNum;
const TEL = String(AJ.telefono || '').trim();
const INSTA = String(AJ.instagram || '').trim();
const INSTA_HANDLE = INSTA.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
const INSTA_URL = String(AJ.instagram_url || '').trim() || (INSTA_HANDLE ? 'https://www.instagram.com/' + INSTA_HANDLE + '/' : '');
const FIRST = String(AJ.responsable || '').trim().split(/\s+/)[0];
const HI = FIRST ? 'Hola ' + FIRST + ',' : 'Hola,';
const MSG_GEN = String(AJ.whatsapp_mensaje || '').trim() || (HI + ' me gustaría información sobre las rutas guiadas de ' + String(AJ.nombre || 'Guadarramaa.guidess') + ' y cómo reservar plaza.');
const msgRuta = r => HI + ' quiero reservar plaza en la ' + r.titulo + '. ¿Qué fechas hay disponibles y cuál es el precio?';
let COMM = String(AJ.whatsapp_comunidad || '').trim();
if (COMM && !/^https:\/\/(chat\.whatsapp\.com|www\.whatsapp\.com\/channel|whatsapp\.com\/channel)\//i.test(COMM)) {
  console.warn('⚠ El enlace de la comunidad de WhatsApp no parece válido y se ha ignorado: ' + COMM);
  COMM = '';
}
const AVISOS = AJ.avisos_provisionales !== false;
const wa = msg => waNum ? 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg || MSG_GEN) : '/contacto/#formulario';
const waExt = () => !!waNum;
const waAttrs = () => waNum ? ' target="_blank" rel="noopener"' : '';

/* ---------- iconos ---------- */
const IC = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
  mountain: '<path d="M3 19l6-11 4 6 2-3 6 8z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  wa: '<path d="M3 21l1.6-5A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 9c0 3 3 6 6 6l1.5-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  insta: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".8" fill="currentColor"/>',
  group: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c.5-4 3-6 6-6s5.500 2 6 6M15 14.500c3 0 5 1.500 6 5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.500"/>',
  bag: '<path d="M7 8V6a5 5 0 0 1 10 0v2"/><rect x="5" y="8" width="14" height="13" rx="2"/><path d="M9 13h6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.500 8.500l-2 5-5 2 2-5z"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.500A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11z"/>',
  leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M5 19c3-5 6-7 10-9"/>'
};
const ic = (n, s) => '<svg class="ic" width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>';
const SERV_ICONS = ['route', 'group', 'camera', 'bag', 'compass', 'heart', 'leaf', 'mountain'];

/* ---------- ilustraciones provisionales (SVG propios, sin derechos) ---------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function noise1(seed) { const r = rng(seed), T = []; for (let i = 0; i < 256; i++) T.push(r()); return x => { const i = Math.floor(x), f = x - i, a = T[((i % 256) + 256) % 256], b = T[(((i + 1) % 256) + 256) % 256], u = (1 - Math.cos(f * Math.PI)) / 2; return a * (1 - u) + b * u; }; }
const MOODS = {
  alba: { sky: ['#F1D7B0', '#E9B98E', '#B7B9A8'], sun: '#FFF0CC', ridges: ['#A9B3A6', '#86A092', '#628272', '#41624F', '#223F2D'], mist: '#FFF3DC' },
  dia: { sky: ['#8FBBD1', '#C9DDDD', '#E6EBDD'], sun: '#FFFBE8', ridges: ['#9DB5B0', '#7C9C8C', '#5B8068', '#3E634E', '#21402E'], mist: '#F5F7EE' },
  tarde: { sky: ['#E3996A', '#F0C38E', '#F3DDB4'], sun: '#FFE7B0', ridges: ['#B79C8A', '#8C8E75', '#66765A', '#44593F', '#26381F'], mist: '#FBE6C4' },
  niebla: { sky: ['#AEBBB4', '#CCD5CC', '#E3E7DC'], sun: '#F4F6EE', ridges: ['#B5C0B8', '#98A99F', '#74897C', '#51695A', '#2D4637'], mist: '#EEF1EA' }
};
const LAYERS = [[.50, .30, .0016], [.60, .26, .0022], [.70, .22, .0030], [.80, .17, .0042], [.90, .12, .0060]];
function landscapeSVG(seed, mood) {
  const M = MOODS[mood] || MOODS.dia, W = 1600, H = 1000, r = rng(seed * 7919 + 13);
  const sx = Math.round(W * (.18 + r() * .64)), sy = Math.round(H * (.2 + r() * .12));
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + M.sky[0] + '"/><stop offset=".55" stop-color="' + M.sky[1] + '"/><stop offset="1" stop-color="' + M.sky[2] + '"/></linearGradient><radialGradient id="g"><stop offset="0" stop-color="' + M.sun + '" stop-opacity=".95"/><stop offset=".25" stop-color="' + M.sun + '" stop-opacity=".45"/><stop offset="1" stop-color="' + M.sun + '" stop-opacity="0"/></radialGradient><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + M.mist + '" stop-opacity="0"/><stop offset="1" stop-color="' + M.mist + '" stop-opacity=".75"/></linearGradient></defs><rect width="' + W + '" height="' + H + '" fill="url(#s)"/><circle cx="' + sx + '" cy="' + sy + '" r="' + W * .16 + '" fill="url(#g)"/><circle cx="' + sx + '" cy="' + sy + '" r="' + W * .035 + '" fill="' + M.sun + '"/>';
  const hy = (n, l, x) => H * l[0] - H * l[1] * (.55 * n(x * l[2]) + .3 * n(x * l[2] * 2.1 + 50) + .15 * n(x * l[2] * 4.3 + 90));
  LAYERS.forEach((l, i) => {
    const n = noise1(seed * 31 + i * 17); let d = 'M0 ' + H;
    for (let x = 0; x <= W; x += 20) d += 'L' + x + ' ' + hy(n, l, x).toFixed(0);
    s += '<path d="' + d + 'L' + W + ' ' + H + 'Z" fill="' + M.ridges[i] + '"/>';
    if (i < 4) s += '<rect x="0" y="' + Math.round(H * (l[0] - .04)) + '" width="' + W + '" height="' + Math.round(H * .24) + '" fill="url(#m)"/>';
  });
  const l5 = LAYERS[4], n5 = noise1(seed * 31 + 4 * 17); let t = '';
  for (let x = 8; x < W; x += 13 + r() * 17) {
    const y = hy(n5, l5, x) + 5, h = 30 + r() * 36, w = h * .48, f = v => v.toFixed(0);
    t += 'M' + f(x) + ' ' + f(y - h) + 'L' + f(x + w * .36) + ' ' + f(y - h * .5) + 'L' + f(x + w * .2) + ' ' + f(y - h * .5) + 'L' + f(x + w * .5) + ' ' + f(y) + 'L' + f(x - w * .5) + ' ' + f(y) + 'L' + f(x - w * .2) + ' ' + f(y - h * .5) + 'L' + f(x - w * .36) + ' ' + f(y - h * .5) + 'Z';
  }
  return s + '<path d="' + t + '" fill="' + M.ridges[4] + '"/></svg>';
}
const PH = new Map();
function phUrl(mood, seed) {
  mood = MOODS[mood] ? mood : 'dia'; seed = Math.abs(parseInt(seed, 10)) || 1;
  const name = mood + '-' + seed + '.svg';
  PH.set(name, [seed, mood]);
  return '/img/placeholders/' + name;
}
function hashSeed(str) { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 997; return h || 1; }
const MOOD_LIST = ['alba', 'dia', 'tarde', 'niebla'];
const moodFor = seed => MOOD_LIST[seed % 4];

/* figura con imagen: si no hay foto, usa la ilustración provisional */
function pic(src, alt, o) {
  o = o || {};
  const seed = o.seed || 1, mood = o.mood || moodFor(seed);
  const real = has(src);
  const url = real ? src : phUrl(mood, seed);
  const dims = real ? '' : ' width="1600" height="1000"';
  return '<figure class="ph ' + (o.cls || '') + '"><img src="' + esc(url) + '" alt="' + esc(alt || '') + '"' + dims + (o.eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"') + '>' + (!real && AVISOS ? '<span class="ph-tag">Foto provisional</span>' : '') + '</figure>';
}

/* ---------- piezas ---------- */
const diffN = d => ({ 'Fácil': 1, 'Moderada': 2, 'Exigente': 3 }[d] || 0);
const pips = d => '<span class="pips" aria-hidden="true">' + [1, 2, 3].map(i => '<i class="' + (i <= diffN(d) ? 'on' : '') + '"></i>').join('') + '</span>';
const P = (v, suf) => has(v) ? esc(v) + (suf || '') : '<span class="pend">Por confirmar</span>';
const dificultad = r => pips(r.dificultad) + (has(r.dificultad) ? esc(r.dificultad) : '<span class="pend">Por confirmar</span>');
const rUrl = r => '/rutas/' + r.id + '/';
const rSeed = r => Number(r.semilla) || hashSeed(r.id);
const routeById = id => RUTAS.find(r => r.id === id);

function routeCard(r) {
  const seed = rSeed(r);
  return '<article class="rcard rv"><a class="rcard-img" href="' + rUrl(r) + '" tabindex="-1" aria-hidden="true">' + pic(r.imagen, 'Paisaje de ' + r.titulo, { seed, cls: 'r43' }) + (has(r.dificultad) ? '<span class="badge">' + esc(r.dificultad) + '</span>' : '') + '</a>' +
    '<div class="rcard-b"><span class="zona">' + T(r.zona) + '</span><h3><a href="' + rUrl(r) + '">' + esc(r.titulo) + '</a></h3>' +
    '<p>' + T(r.resumen || 'PROVISIONAL: Resumen breve de la ruta.') + '</p>' +
    '<dl class="mini"><div><dt>Duración</dt><dd>' + P(r.duracion) + '</dd></div><div><dt>Distancia</dt><dd>' + P(r.km, ' km') + '</dd></div><div><dt>Dificultad</dt><dd>' + dificultad(r) + '</dd></div><div><dt>Desnivel</dt><dd>' + P(r.desnivel, ' m') + '</dd></div></dl>' +
    '<div class="foot-c"><span class="price">' + (has(r.precio) ? esc(r.precio) : '<span class="pend">Precio por confirmar</span>') + '</span><div class="acts"><a class="btn btn-o btn-s" href="' + rUrl(r) + '">Ver ruta ' + ic('arrow', 16) + '</a><a class="btn btn-wa btn-s" href="' + wa(msgRuta(r)) + '"' + waAttrs() + ' aria-label="Reservar ' + esc(r.titulo) + ' por WhatsApp">' + ic('wa', 18) + '</a></div></div></div></article>';
}
function evTitle(e) { const r = routeById(e.ruta); return r ? r.titulo : (has(e.titulo) ? e.titulo : 'Actividad'); }
function evCard(e) {
  const r = routeById(e.ruta), d = e.fecha ? new Date(String(e.fecha).slice(0, 10) + 'T12:00:00Z') : null;
  const box = d && !isNaN(d) ? '<div class="ev-d"><b>' + d.getUTCDate() + '</b><span>' + d.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }).replace('.', '') + '</span></div>' : '<div class="ev-d none"><b>—</b><span>Fecha</span></div>';
  const title = evTitle(e);
  const link = r ? '<a href="' + rUrl(r) + '">' + esc(title) + '</a>' : esc(title);
  return '<div class="ev rv" data-fecha="' + esc(String(e.fecha || '').slice(0, 10)) + '">' + box + '<div class="ev-m"><strong>' + link + '</strong><small>' +
    (d && !isNaN(d) ? esc(fmtDate(e.fecha, true)) : '<span class="pend">Fecha por confirmar</span>') + ' · ' + (has(e.hora) ? esc(e.hora) + ' h' : '<span class="pend">Hora por confirmar</span>') + ' · ' + (has(e.plazas) ? esc(e.plazas) + ' plazas' : '<span class="pend">Plazas por confirmar</span>') + '</small>' + (has(e.nota) ? '<small class="note">' + T(e.nota) + '</small>' : '') + '</div>' +
    '<a class="btn btn-o btn-s" href="' + wa(HI + ' quiero reservar plaza en: ' + title + (e.fecha ? ' (' + fmtDate(e.fecha) + ')' : '') + '. ¿Hay plazas disponibles?') + '"' + waAttrs() + '>' + ic('wa', 16) + ' Reservar</a></div>';
}
const sortedEvents = () => {
  const dated = SAL.items.filter(e => has(e.fecha)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return { dated, undated: SAL.items.filter(e => !has(e.fecha)) };
};
function evList(list, cls) {
  const { dated, undated } = sortedEvents();
  const items = list || dated.concat(undated);
  return '<div class="evs ' + (cls || '') + '" data-evlist>' + items.map(evCard).join('') + '<p class="empty-n" hidden>Ahora mismo no hay actividades con fecha. Escríbenos y te avisamos de la próxima salida.</p></div>';
}
function serviceCard(s) {
  const icon = SERV_ICONS.includes(s.icono) ? s.icono : 'route';
  return '<article class="svc rv"><span class="svc-i">' + ic(icon, 28) + '</span><h3>' + T(s.titulo) + '</h3><p>' + T(s.texto) + '</p></article>';
}
function quoteCards(full) {
  /* Valoraciones públicas: las tarjetas las pinta main.js desde /api/valoraciones.
     full = true → página /opiniones/ (todas + formulario). full = false → muestra de 3 en la portada.
     Las opiniones de content/opiniones.json se conservan en el panel pero ya no se muestran. */
  const star = ic('star', 18);
  const radios = [1, 2, 3, 4, 5].map(n => '<input type="radio" name="estrellas" id="v-e' + n + '" value="' + n + '"><label for="v-e' + n + '" title="' + n + (n === 1 ? ' estrella' : ' estrellas') + '"><span class="sr">' + n + (n === 1 ? ' estrella' : ' estrellas') + '</span>' + ic('star', 30) + '</label>').join('');
  const form = '<div class="val-form rv" id="valorar"><h3>Deja tu valoración</h3>' +
    '<div class="done" id="val-ok" hidden tabindex="-1"><h3>¡Gracias por tu valoración!</h3><p>Ya está publicada. Ahora puedes verla en esta página.</p></div>' +
    '<form id="val-form" novalidate><p class="hp" aria-hidden="true"><label>No rellenar<input name="web" tabindex="-1" autocomplete="off"></label></p>' +
    '<div class="fg"><label for="v-nombre">Nombre<input id="v-nombre" name="nombre" maxlength="40" autocomplete="given-name" required><span class="err" data-err></span></label>' +
    '<fieldset class="star-in" aria-describedby="v-e-err"><legend>Puntuación</legend><div class="star-row">' + radios + '</div><span class="err" id="v-e-err" data-err></span></fieldset>' +
    '<label class="full" for="v-msg">Comentario<textarea id="v-msg" name="comentario" rows="4" maxlength="600" required></textarea><span class="count" data-count aria-live="off">0 / 600</span><span class="err" data-err></span></label></div>' +
    '<p class="val-priv">Se publicarán tu nombre y tu comentario. No escribas teléfonos, correos ni otros datos personales. Más información en la <a href="/legal/">política de privacidad</a>.</p>' +
    '<p class="form-err" id="val-fail" role="alert" hidden></p>' +
    '<div><button class="btn btn-a" type="submit">Publicar valoración</button></div></form></div>';
  return '<div data-valoraciones' + (full ? '' : ' data-limit="3"') + ' data-star=\'' + star.replace(/'/g, '&#39;') + '\'>' +
    '<div class="val-sum" data-val-sum hidden></div>' +
    '<div class="quotes" data-val-list></div>' +
    '<p class="empty-n" data-val-empty hidden>Todavía no hay valoraciones. ' + (full ? 'Cuéntanos tu experiencia y sé la primera persona en publicarla.' : '<a href="/opiniones/#valorar">Sé la primera persona en publicar la suya</a>.') + '</p>' +
    '<p class="val-err" data-val-loaderr role="alert" hidden>No se han podido cargar las valoraciones ahora mismo.' + (full ? ' Puedes publicar la tuya igualmente.' : '') + '</p>' +
    (full ? '<div class="val-more" data-val-more hidden><button type="button" class="btn btn-o btn-s">Ver más valoraciones</button></div>' : '') +
    '<p class="val-note">Opiniones publicadas por los visitantes</p>' +
    '<noscript><p class="empty-n">Para ver y publicar valoraciones necesitas activar JavaScript en tu navegador.</p></noscript>' +
    (full ? form : '<p class="val-all"><a class="btn btn-o" href="/opiniones/">Ver todas las opiniones</a></p>') + '</div>';
}
function faqList(items, limit) {
  items = limit ? items.slice(0, limit) : items;
  return '<div class="faq">' + items.map(f => '<details class="rv"><summary>' + esc(stripProv(f.pregunta)) + '<span class="pm">' + ic('plus', 20) + '</span></summary><div class="ans">' + md(f.respuesta, { shift: 2 }) + '</div></details>').join('') + '</div>';
}
function blogCard(p) {
  const seed = hashSeed(p.slug);
  return '<article class="pcard rv"><a class="pcard-img" href="/blog/' + p.slug + '/" tabindex="-1" aria-hidden="true">' + pic(p.imagen, '', { seed, cls: 'r169' }) + '</a><div class="pcard-b"><time datetime="' + esc(String(p.fecha).slice(0, 10)) + '">' + esc(fmtDate(p.fecha)) + '</time><h3><a href="/blog/' + p.slug + '/">' + T(p.titulo) + '</a></h3><p>' + T(p.resumen) + '</p><a class="link" href="/blog/' + p.slug + '/">Leer artículo</a></div></article>';
}
function galleryItems(limit, group) {
  const list = (GAL.fotos || []).map(g => ({
    imagen: g.imagen,
    texto: g.texto || '',
    forma: g.forma || '',
    ruta: g.ruta || ''
  }));

  RUTAS.forEach(r => {
    const fotos = [];

    if (has(r.imagen)) {
      fotos.push({
        imagen: r.imagen,
        texto: r.titulo || '',
        forma: '',
        ruta: r.id
      });
    }

    (r.fotos || []).forEach(f => {
      const imagen = typeof f === 'string' ? f : f && f.imagen;

      if (has(imagen)) {
        fotos.push({
          imagen,
          texto: (f && typeof f === 'object' && (f.descripcion || f.texto)) || r.titulo || '',
          forma: (f && typeof f === 'object' && f.forma) || '',
          ruta: r.id
        });
      }
    });

    fotos.forEach(f => {
      const existente = list.find(g => g.imagen === f.imagen);

      if (existente) {
        if (!existente.ruta) existente.ruta = f.ruta;
      } else {
        list.push(f);
      }
    });
  });

  return list.slice(0, limit || 999).map((g, i) => {
    const seed = hashSeed((g.texto || '') + i), real = has(g.imagen);
    const url = real ? g.imagen : phUrl(moodFor(seed), seed);

    return '<a class="gi rv ' + esc(g.forma || '') + '" href="' + esc(url) + '" data-lb data-ruta="' + esc(g.ruta || '') + '" data-alt="' + esc(g.texto || '') + '" aria-label="Ampliar: ' + esc(g.texto || 'fotografía') + '"><img src="' + esc(url) + '" alt="' + esc(g.texto || '') + '" loading="lazy" decoding="async">' + (!real && AVISOS ? '<span class="ph-tag">Foto provisional</span>' : '') + '</a>';
  }).join('');
}
const BBOX_ZONA = '-4.26,40.52,-3.94,40.80';
function mapBlock(bbox, marker, label) {
  return '<div class="map" data-map="' + esc(bbox || BBOX_ZONA) + '"' + (marker ? ' data-marker="' + esc(marker) + '"' : '') + '><div class="map-ph"><span class="eyebrow">' + esc(label || 'Mapa de la zona') + '</span><p>El mapa se carga desde OpenStreetMap. Al pulsar el botón, tu navegador contacta con ese servicio.</p><button class="btn btn-a" type="button" data-map-load>' + ic('pin', 18) + ' Cargar mapa interactivo</button></div></div>';
}
/* Mensajes preparados: abren WhatsApp con el texto ya escrito (la persona solo pulsa «enviar») */
function quickMsgs() {
  const M = [
    ['Consultar rutas', HI + ' quiero información sobre las rutas guiadas disponibles.'],
    ['Reservar plaza', HI + ' quiero reservar plaza en una ruta. ¿Qué opciones y fechas hay?'],
    ['Próximas fechas', HI + ' ¿cuáles son las próximas fechas de salidas?'],
    ['Primera vez', HI + ' es mi primera vez haciendo senderismo guiado. ¿Qué ruta me recomiendas?'],
    ['Nivel y material', HI + ' quiero saber qué nivel físico y qué material necesito para las rutas.']
  ];
  return '<div class="qm rv"><div><span class="eyebrow">Reservas por WhatsApp</span><h2>Reserva y consulta por WhatsApp</h2><p>Pulsa un mensaje y se abrirá WhatsApp con el texto ya escrito. Solo tienes que enviarlo.</p></div><div class="qm-l">' +
    M.map(m => '<a class="qm-b" href="' + wa(m[1]) + '"' + waAttrs() + '>' + ic('wa', 20) + '<span>' + m[0] + '</span></a>').join('') + '</div></div>';
}
/* Comunidad de WhatsApp: voluntaria. El enlace de invitación se añade en content/ajustes.json */
function communityBlock(kind) {
  const note = 'Unirte es voluntario: nadie se añade a la comunidad. Entras tú, pulsando el enlace, y puedes salir cuando quieras.';
  const btn = COMM
    ? '<a class="btn btn-wa" href="' + esc(COMM) + '" target="_blank" rel="noopener">' + ic('wa', 20) + ' Unirme a la comunidad</a>'
    : '<span class="btn btn-wa is-off" aria-disabled="true">' + ic('wa', 20) + ' Unirme a la comunidad</span><p class="comm-pend"><mark class="prov">Enlace de invitación pendiente. Se añadirá cuando la comunidad esté creada.</mark></p>';
  if (kind === 'card') return '<div class="info comm-card"><h3>Comunidad de WhatsApp</h3><p>Aquí se avisará de próximas rutas y actividades.</p>' + btn + '<p class="comm-note">' + note + '</p></div>';
  return '<section class="band comm"><div class="wrap cta-in"><div><span class="eyebrow">Comunidad</span><h2>Entérate de las próximas rutas y actividades</h2><p>Estoy preparando una comunidad de WhatsApp donde informaré de las próximas rutas y actividades.</p><p class="comm-note">' + note + '</p></div><div class="comm-act">' + btn + '</div></div></section>';
}
const SECTION_HEAD = (eyebrow, title, right, tag) => '<div class="sh rv"><div><span class="eyebrow">' + eyebrow + '</span><' + (tag || 'h2') + '>' + title + '</' + (tag || 'h2') + '></div>' + (right || '') + '</div>';
const BTN_WA = (msg, txt, cls) => '<a class="btn btn-wa ' + (cls || '') + '" href="' + wa(msg) + '"' + waAttrs() + '>' + ic('wa', 20) + ' ' + (txt || 'Reservar por WhatsApp') + '</a>';

/* ---------- plantilla de página ---------- */
const NAV = [['rutas', 'Rutas'], ['actividades', 'Actividades'], ['servicios', 'Servicios'], ['nosotros', 'Nosotros'], ['galeria', 'Galería'], ['opiniones', 'Opiniones'], ['blog', 'Blog'], ['contacto', 'Contacto']];
const NAV_FOOT = NAV.concat([['preguntas-frecuentes', 'Preguntas frecuentes']]);
const SITEMAP = [];

function logo() { return '<a class="logo" href="/" aria-label="' + esc(NAME) + ', inicio"><img src="/img/uploads/Logo%20Guadarramaa.Guidess.jpeg" alt="" width="40" height="40" style="width:40px;height:40px;object-fit:cover;border-radius:8px"><span class="lt"><b>Guadarramaa</b><em>.guidess</em></span></a>'; }

function missingList() {
  const m = [];
  if (!waNum) m.push('WhatsApp'); if (!EMAIL) m.push('correo'); if (INSTA && !String(AJ.instagram_url || '').trim()) m.push('confirmar enlace de Instagram'); if (!COMM) m.push('enlace de la comunidad de WhatsApp'); if (!BASE) m.push('dirección web');
  return m;
}
function header(cur) {
  const isCur = id => cur === id ? ' aria-current="page"' : '';
  const subs = RUTAS.map(r => '<a href="' + rUrl(r) + '">' + esc(r.titulo) + '</a>').join('') + '<a href="/rutas/" class="all">Ver todas las rutas</a>';
  const links = NAV.map(([id, t]) => id === 'rutas' ? '<div class="has-sub"><a href="/rutas/"' + isCur(id) + '>' + t + '</a><div class="sub">' + subs + '</div></div>' : '<a href="/' + id + '/"' + isCur(id) + '>' + t + '</a>').join('');
  const mlinks = NAV.map(([id, t]) => '<a href="/' + id + '/"' + isCur(id) + '>' + t + '</a>' + (id === 'rutas' ? RUTAS.map(r => '<a class="sub-l" href="' + rUrl(r) + '">' + esc(r.titulo) + '</a>').join('') : '')).join('');
  return '<a class="skip" href="#contenido">Saltar al contenido</a>' +
    '<header class="site-head" id="top"><div class="wrap bar">' + logo() + '<nav class="nav" aria-label="Principal">' + links + '<a class="btn btn-wa btn-s" href="' + wa() + '"' + waAttrs() + '>' + ic('wa', 18) + ' Reservar</a></nav>' +
    '<button class="burger" type="button" aria-expanded="false" aria-controls="menu" aria-label="Abrir menú">' + ic('menu', 26) + '</button></div>' +
    '<div class="menu" id="menu" hidden><div class="wrap">' + mlinks + '<a class="btn btn-wa" href="' + wa() + '"' + waAttrs() + '>' + ic('wa', 20) + ' Reservar por WhatsApp</a></div></div></header>';
}
function footer() {
  return '<footer class="foot band"><div class="wrap"><div class="foot-g"><div>' + logo() + '<p>Rutas guiadas por la Sierra de Guadarrama, en la Comunidad de Madrid.</p></div>' +
    '<div><h2>Explora</h2>' + NAV_FOOT.map(([id, t]) => '<a href="/' + id + '/">' + t + '</a>').join('') + '</div>' +
    '<div><h2>Rutas</h2>' + RUTAS.map(r => '<a href="' + rUrl(r) + '">' + esc(r.titulo) + '</a>').join('') + '</div>' +
    '<div><h2>Contacto</h2>' +
    '<p>' + (EMAIL ? '<a href="mailto:' + esc(EMAIL) + '">' + esc(EMAIL) + '</a>' : '<mark class="prov">Correo por confirmar</mark>') + '</p>' +
    (waNum ? '<p><a href="' + wa() + '" target="_blank" rel="noopener">WhatsApp ' + esc(waPretty()) + '</a></p>' : '<p><mark class="prov">WhatsApp por confirmar</mark></p>') +
    (TEL ? '<p><a href="tel:' + esc(TEL.replace(/[^\d+]/g, '')) + '">' + esc(TEL) + '</a></p>' : '') +
    (INSTA_URL ? '<p><a href="' + esc(INSTA_URL) + '" target="_blank" rel="noopener">Instagram @' + esc(INSTA_HANDLE) + '</a></p>' : '') +
    '</div></div><div class="foot-b"><span>© ' + new Date().getFullYear() + ' ' + esc(NAME) + '</span><a href="/legal/">Aviso legal y privacidad</a></div></div></footer>' +
    '<a class="wa-float" href="' + wa() + '"' + waAttrs() + ' aria-label="Reservar o consultar por WhatsApp">' + ic('wa', 26) + '<span>WhatsApp</span></a>';
}
function jsonld(obj) { return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>'; }
function orgLD() {
  const o = { '@context': 'https://schema.org', '@type': 'TouristInformationCenter', name: NAME, description: 'Rutas guiadas de senderismo por la Sierra de Guadarrama, en la Comunidad de Madrid.', areaServed: 'Sierra de Guadarrama', inLanguage: 'es' };
  o['@type'] = 'Organization';
  if (BASE) o.url = BASE + '/';
  if (EMAIL) o.email = EMAIL;
  if (TEL) o.telephone = TEL;
  if (INSTA_URL) o.sameAs = [INSTA_URL];
  if (AJ.responsable) o.founder = { '@type': 'Person', name: AJ.responsable };
  return o;
}
function page(rel, o) {
  const url = rel === '' ? '/' : '/' + rel + '/';
  const title = o.title, desc = stripProv(o.desc || '').slice(0, 300);
  const og = o.image ? (/^https?:/.test(o.image) ? o.image : (BASE || '') + o.image) : (BASE || '') + '/img/og-default.png';
  const html = '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '">' +
    (o.noindex ? '<meta name="robots" content="noindex,follow">' : '') +
    (BASE && !o.noindex ? '<link rel="canonical" href="' + BASE + url + '">' : '') +
    '<meta property="og:type" content="' + (o.ogType || 'website') + '"><meta property="og:locale" content="es_ES"><meta property="og:site_name" content="' + esc(NAME) + '"><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '">' +
    (BASE && !o.noindex ? '<meta property="og:url" content="' + BASE + url + '">' : '') + '<meta property="og:image" content="' + esc(og) + '"><meta name="twitter:card" content="summary_large_image">' +
    '<meta name="theme-color" content="#1F3D2B"><link rel="icon" href="/favicon.svg" type="image/svg+xml">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&family=Young+Serif&display=swap">' +
    (o.preload ? '<link rel="preload" as="image" href="' + esc(o.preload) + '" fetchpriority="high">' : '') +
    '<link rel="stylesheet" href="/css/styles.css?v=' + VERSION + '"><script>document.documentElement.classList.add("js")</script>' +
    (o.ld || []).map(jsonld).join('') + '</head><body class="' + (o.bodyClass || '') + '">' +
    header(o.nav) + '<main id="contenido" tabindex="-1">' + o.body + '</main>' + footer() +
    '<script src="/js/main.js?v=' + VERSION + '" defer></script></body></html>';
  const dir = rel === '404.html' ? OUT : path.join(OUT, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(rel === '404.html' ? path.join(OUT, '404.html') : path.join(dir, 'index.html'), html);
  if (!o.noindex) SITEMAP.push(url);
}
function phead(crumb, title, lead) {
  return '<section class="band phead"><div class="wrap"><div class="crumb"><a href="/">Inicio</a> / ' + crumb + '</div><h1>' + title + '</h1>' + (lead ? '<p class="lead">' + lead + '</p>' : '') + '</div></section>';
}
function ctaBand(titulo, texto) {
  return '<section class="band cta"><div class="wrap cta-in"><div><span class="eyebrow">Contacto y reservas</span><h2>' + (titulo || '¿Hablamos de tu próxima ruta?') + '</h2><p>' + (texto || 'Reserva plaza o cuéntanos tus dudas. Respondemos a cada consulta.') + '</p></div><div class="cta-row">' + BTN_WA(MSG_GEN, 'Reservar por WhatsApp') + '<a class="btn btn-g" href="/contacto/">Escribir un mensaje</a></div></div></section>';
}

/* ---------- mapa de Wikiloc (opcional por ruta: campo «wikiloc» en el panel) ---------- */
function wikilocId(r) {
  const v = String(r.wikiloc == null ? '' : r.wikiloc).trim();
  if (!v) return '';
  if (/^\d{4,12}$/.test(v)) return v;
  const m = v.match(/[?&]id=(\d{4,12})/) || v.match(/-(\d{4,12})(?:[/?#]|$)/);   // admite la URL completa o el código iframe
  return m ? m[1] : '';
}
function wikilocBlock(r) {
  const id = wikilocId(r);
  if (!id) return '';
  const view = 'https://es.wikiloc.com/wikiloc/view.do?id=' + id;
  return '<div class="block rv"><h2>Mapa de la ruta en Wikiloc</h2>' +
    '<div class="wl" data-wl="' + id + '" data-title="' + esc(r.titulo) + '"><div class="map-ph"><span class="eyebrow">Mapa con perfil de elevación y fotos</span><p>El mapa se carga desde Wikiloc. Al pulsar el botón, tu navegador contacta con ese servicio.</p><button class="btn btn-a" type="button" data-wl-load>' + ic('pin', 18) + ' Cargar mapa de Wikiloc</button></div></div>' +
    '<p class="wl-cta"><a class="btn btn-o" href="' + view + '" target="_blank" rel="noopener">Ver y seguir ruta en Wikiloc</a></p></div>';
}

/* ---------- perfil de altitud ---------- */
function perfilSVG(r) {
  const pts = String(r.perfil || '').split(/[;,]\s*/).map(s => s.split(':').map(Number)).filter(a => a.length === 2 && a.every(n => !isNaN(n)));
  if (pts.length < 2) return '';
  const W = 640, H = 230, L = 52, Rr = 14, Tt = 14, B = 32, kmMax = Math.max(...pts.map(a => a[0])), al = pts.map(a => a[1]);
  let lo = Math.floor(Math.min(...al) / 50) * 50, hi = Math.ceil(Math.max(...al) / 50) * 50; if (hi === lo) hi = lo + 50;
  const X = k => L + (W - L - Rr) * k / (kmMax || 1), Y = a => Tt + (H - Tt - B) * (1 - (a - lo) / (hi - lo));
  const ln = pts.map((a, i) => (i ? 'L' : 'M') + X(a[0]).toFixed(1) + ' ' + Y(a[1]).toFixed(1)).join('');
  let g = ''; for (let i = 0; i <= 3; i++) { const a = lo + (hi - lo) * i / 3, y = Y(a); g += '<line class="gl" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + Math.round(a) + ' m</text>'; }
  const st = kmMax > 12 ? 2 : kmMax > 5 ? 1 : .5; for (let k = 0; k <= kmMax + .001; k += st) g += '<text class="ax" x="' + X(k).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + k + ' km</text>';
  return '<div class="profile"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Perfil de altitud de ' + esc(r.titulo) + '">' + g + '<path class="pa" d="' + ln + 'L' + X(pts[pts.length - 1][0]).toFixed(1) + ' ' + (H - B) + 'L' + X(pts[0][0]).toFixed(1) + ' ' + (H - B) + 'Z"/><path class="pl" d="' + ln + '"/></svg></div>';
}

/* =====================================================================
   PÁGINAS
   ===================================================================== */
const heroSrc = has(PORT.imagen) ? PORT.imagen : phUrl('alba', 6);

/* ---- Inicio ---- */
(function home() {
  const feat = RUTAS.filter(r => r.destacada !== false).slice(0, 6);
  const { dated, undated } = sortedEvents();
  const next = dated.concat(undated).slice(0, 3);
  const body =
    '<section class="hero"><img class="bgimg" src="' + esc(heroSrc) + '" alt="" fetchpriority="high" width="1600" height="1000"><div class="wrap hero-in"><span class="eyebrow">Senderismo guiado · Sierra de Guadarrama</span>' +
    '<h1>' + T(PORT.titulo || 'Rutas guiadas por la Sierra de Guadarrama') + '</h1><p class="lead">' + T(PORT.lema || 'PROVISIONAL: Frase de presentación de la empresa.') + '</p>' +
    '<div class="cta-row"><a class="btn btn-a" href="/rutas/">Descubre las rutas</a>' + BTN_WA(MSG_GEN, 'Reservar por WhatsApp', 'btn-wag') + '</div>' +
    '<a class="scroll-cue" href="#presentacion" aria-label="Seguir bajando">' + ic('arrow', 20) + '</a></div>' +
    (!has(PORT.imagen) && AVISOS ? '<span class="ph-note">Ilustración provisional · sustituir por fotografía</span>' : '') + '</section>' +

    '<section class="sec" id="presentacion"><div class="wrap split"><div class="prose rv">' + '<span class="eyebrow">Quiénes somos</span><h2>' + T(PORT.presentacion_titulo || 'PROVISIONAL: Título de presentación de la empresa') + '</h2>' + md(PORT.presentacion || 'PROVISIONAL: Texto de presentación de la empresa.') + '<p><a class="link" href="/nosotros/">Conoce al equipo</a></p></div>' +
    '<div class="rv">' + pic(PORT.imagen_presentacion, 'Paisaje de la Sierra de Guadarrama', { seed: 14, mood: 'niebla', cls: 'r32 tilt' }) + '</div></div></section>' +

    '<section class="sec alt"><div class="wrap">' + SECTION_HEAD('Rutas guiadas', 'Nuestras rutas', '<a class="link" href="/rutas/">Ver todas</a>') + '<div class="grid">' + feat.map(routeCard).join('') + '</div></div></section>' +

    '<section class="sec"><div class="wrap">' + SECTION_HEAD('Experiencias', 'Qué ofrecemos', '<a class="link" href="/servicios/">Todos los servicios</a>') + '<div class="svcs">' + SERV.items.slice(0, 4).map(serviceCard).join('') + '</div></div></section>' +

    '<section class="sec alt"><div class="wrap">' + SECTION_HEAD('Calendario', 'Próximas actividades', '<a class="link" href="/actividades/">Ver calendario</a>') + evList(next) + '</div></section>' +

    '<section class="sec"><div class="wrap">' + SECTION_HEAD('Galería', 'Imágenes de la sierra', '<a class="link" href="/galeria/">Ver galería completa</a>') + '<div class="gal" data-gal>' + galleryItems(6) + '</div></div></section>' +

    '<section class="sec alt"><div class="wrap">' + SECTION_HEAD('Opiniones', 'Lo que cuentan quienes caminan con nosotros') + quoteCards(false) + '</div></section>' + '<section class="sec"><div class="wrap">' + quickMsgs() + '</div></section>' + communityBlock() +

    '<section class="sec"><div class="wrap split">' + '<div class="prose rv"><span class="eyebrow">Dónde estamos</span><h2>Mapa de la zona</h2><p>Nuestras rutas recorren la Sierra de Guadarrama, en la Comunidad de Madrid. Aquí puedes ver la zona.</p><ul class="zones">' + RUTAS.map(r => '<li><a href="' + rUrl(r) + '">' + esc(r.titulo) + '</a> <span>' + T(r.zona) + '</span></li>').join('') + '</ul></div><div class="rv">' + mapBlock() + '</div></div></section>' +

    (POSTS.length ? '<section class="sec alt"><div class="wrap">' + SECTION_HEAD('Blog y novedades', 'Últimas novedades', '<a class="link" href="/blog/">Ir al blog</a>') + '<div class="grid">' + POSTS.slice(0, 3).map(blogCard).join('') + '</div></div></section>' : '') +

    '<section class="sec"><div class="wrap narrow">' + SECTION_HEAD('Dudas', 'Preguntas frecuentes', '<a class="link" href="/preguntas-frecuentes/">Ver todas</a>') + faqList(FAQ.items, 5) + '</div></section>' +
    ctaBand();
  page('', {
    title: NAME + ' | Rutas guiadas por la Sierra de Guadarrama',
    desc: 'Rutas guiadas y senderismo guiado en la Sierra de Guadarrama, Comunidad de Madrid. Excursiones guiadas a El Escorial y al Valle de la Fuenfría (Cercedilla). Reserva por WhatsApp.',
    body, nav: '', preload: heroSrc, bodyClass: 'home', ld: [orgLD()]
  });
})();

/* ---- Rutas ---- */
page('rutas', {
  title: 'Rutas guiadas Sierra de Guadarrama | ' + NAME,
  desc: 'Todas las rutas guiadas de ' + NAME + ' por la Sierra de Guadarrama: duración, distancia, dificultad, desnivel y precio de cada excursión guiada.',
  nav: 'rutas',
  body: phead('Rutas', 'Rutas guiadas por la Sierra de Guadarrama', 'Una ficha por excursión, con toda la información práctica en el mismo sitio.') +
    '<section class="sec"><div class="wrap"><div class="grid">' + RUTAS.map(routeCard).join('') + (AVISOS ? '<div class="nextcard rv"><span class="eyebrow">Próximamente</span><h3>Espacio para la siguiente ruta</h3><p>Cada ruta nueva que se publica desde el panel aparece aquí con su propia ficha.</p></div>' : '') + '</div></div></section>' + ctaBand()
});

/* ---- Ficha de cada ruta ---- */
RUTAS.forEach(r => {
  const seed = rSeed(r), evs = SAL.items.filter(e => e.ruta === r.id).sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')));
  const fotos = (r.fotos || []).map(f => f.imagen || f).filter(Boolean);
  const thumbs = (fotos.length ? fotos : [null, null, null]).slice(0, 8).map((f, i) => {
    const s = seed + (i + 1) * 3, url = f || phUrl(moodFor(s), s);
    return '<a class="gi rv" href="' + esc(url) + '" data-lb data-alt="' + esc(r.titulo) + '" aria-label="Ampliar fotografía de ' + esc(r.titulo) + '"><img src="' + esc(url) + '" alt="Fotografía de ' + esc(r.titulo) + '" loading="lazy" decoding="async">' + (!f && AVISOS ? '<span class="ph-tag">Foto provisional</span>' : '') + '</a>';
  }).join('');
  const msg = msgRuta(r);
  const heroImg = has(r.imagen) ? r.imagen : phUrl(moodFor(seed), seed);
  const mapMark = has(r.lat) && has(r.lng) ? Number(r.lat) + ',' + Number(r.lng) : '';
  const bbox = mapMark ? [Number(r.lng) - .03, Number(r.lat) - .02, Number(r.lng) + .03, Number(r.lat) + .02].map(n => n.toFixed(4)).join(',') : BBOX_ZONA;
  const others = RUTAS.filter(x => x.id !== r.id);
  const body =
    '<section class="rhero"><img class="bgimg" src="' + esc(heroImg) + '" alt="" fetchpriority="high"><div class="wrap rhero-in"><div class="crumb"><a href="/">Inicio</a> / <a href="/rutas/">Rutas</a></div><h1>' + esc(r.titulo) + '</h1><p class="lead">' + T(r.zona) + '</p>' +
    '<div class="cta-row">' + BTN_WA(msg, 'Reservar por WhatsApp') + '<a class="btn btn-g" href="#fechas">Ver fechas</a></div></div>' + (!has(r.imagen) && AVISOS ? '<span class="ph-note">Ilustración provisional · sustituir por fotografía</span>' : '') + '</section>' +
    '<div class="wrap"><dl class="facts">' +
    '<div class="fact"><dt>' + ic('clock', 18) + 'Duración</dt><dd>' + P(r.duracion) + '</dd></div>' +
    '<div class="fact"><dt>' + ic('route', 18) + 'Distancia</dt><dd>' + P(r.km, ' km') + '</dd></div>' +
    '<div class="fact"><dt>' + ic('mountain', 18) + 'Dificultad</dt><dd>' + dificultad(r) + '</dd></div>' +
    '<div class="fact"><dt>' + ic('up', 18) + 'Desnivel</dt><dd>' + P(r.desnivel, ' m') + '</dd></div>' +
    '<div class="fact"><dt>' + ic('pin', 18) + 'Punto de encuentro</dt><dd>' + P(r.encuentro) + '</dd></div>' +
    '<div class="fact"><dt>' + ic('tag', 18) + 'Precio</dt><dd>' + P(r.precio) + '</dd></div></dl></div>' +
    '<section class="sec"><div class="wrap two"><div>' +
    '<div class="block rv"><span class="eyebrow">' + T(r.zona) + '</span><h2>Sobre la ruta</h2><div class="prose">' + md(r.descripcion || 'PROVISIONAL: Descripción completa de la ruta: recorrido, paisaje y qué esperar de la jornada.', { shift: 2 }) + '</div></div>' +
    (has(r.incluye) ? '<div class="block rv"><h2>Qué incluye</h2><div class="prose">' + md(r.incluye, { shift: 2 }) + '</div></div>' : '') +
    '<div class="block rv"><h2>Material recomendado</h2>' + (has(r.material) ? '<ul class="mat">' + String(r.material).split(/\r?\n/).filter(x => x.trim()).map(m => '<li>' + T(m.replace(/^[-*]\s*/, '')) + '</li>').join('') + '</ul>' : '<p><mark class="prov">Lista de material recomendado por confirmar.</mark></p>') + '</div>' +
    (perfilSVG(r) ? '<div class="block rv"><h2>Perfil de la ruta</h2>' + perfilSVG(r) + '</div>' : '') +
    wikilocBlock(r) +
    '<div class="block rv"><h2>Fotografías</h2><div class="thumbs" data-gal>' + thumbs + '</div></div>' +
    '<div class="block rv"><h2>Dónde empieza</h2>' + mapBlock(bbox, mapMark, mapMark ? 'Punto de encuentro' : 'Zona de la ruta') + (!mapMark && AVISOS ? '<p class="notebox">Para marcar el punto de encuentro en el mapa, añade sus coordenadas en la ficha de la ruta desde el panel.</p>' : '') + '</div>' +
    '</div><aside class="book rv" id="reservar" aria-label="Reservas"><div><span class="zona">Precio</span><div class="price-l">' + P(r.precio) + '</div></div>' +
    '<div id="fechas"><h3>Próximas fechas</h3>' + (evs.length ? '<div class="evs mini-ev" data-evlist>' + evs.map(e => '<div class="ev-s" data-fecha="' + esc(String(e.fecha || '').slice(0, 10)) + '"><strong>' + (has(e.fecha) ? esc(fmtDate(e.fecha, true)) : '<span class="pend">Fecha por confirmar</span>') + '</strong><small>' + (has(e.hora) ? esc(e.hora) + ' h' : '<span class="pend">Hora por confirmar</span>') + (has(e.plazas) ? ' · ' + esc(e.plazas) + ' plazas' : '') + '</small></div>').join('') + '<p class="empty-n" hidden>Sin fechas publicadas ahora mismo. Escríbenos y te avisamos.</p></div>' : '<p class="pend">Sin fechas publicadas</p>') + '</div>' +
    BTN_WA(msg, 'Reservar por WhatsApp', 'full') + '<a class="btn btn-o full" href="' + wa(HI + ' me gustaría información sobre la ' + r.titulo + '.') + '"' + waAttrs() + '>' + ic('wa', 20) + ' Consultar por WhatsApp</a><a class="link" href="/contacto/?ruta=' + r.id + '#formulario" style="justify-self:start">O usa el formulario</a></aside></div></section>' +
    (others.length ? '<section class="sec alt"><div class="wrap">' + SECTION_HEAD('Más rutas', 'Otras excursiones') + '<div class="grid">' + others.map(routeCard).join('') + '</div></div></section>' : '') + ctaBand();
  const ld = [{ '@context': 'https://schema.org', '@type': 'TouristTrip', name: r.titulo, description: stripProv(r.resumen || r.descripcion || 'Excursión guiada en la Sierra de Guadarrama.').slice(0, 300), provider: { '@type': 'Organization', name: NAME }, inLanguage: 'es' }];
  page('rutas/' + r.id, {
    title: r.titulo + ' | Excursión guiada en la Sierra de Guadarrama',
    desc: stripProv(r.resumen) || ('Ficha de la ' + r.titulo + ': duración, distancia, dificultad, desnivel, punto de encuentro, material recomendado, fechas y precio. Excursión guiada en la Sierra de Guadarrama.'),
    body, nav: 'rutas', image: has(r.imagen) ? r.imagen : null, ld
  });
});

/* ---- Actividades ---- */
(function () {
  const { dated, undated } = sortedEvents();
  page('actividades', {
    title: 'Próximas actividades y excursiones guiadas | ' + NAME,
    desc: 'Calendario de próximas excursiones guiadas y actividades en la Sierra de Guadarrama. Consulta fechas y reserva tu plaza por WhatsApp.',
    nav: 'actividades',
    body: phead('Actividades', 'Próximas actividades y experiencias', 'Consulta las fechas de cada salida y reserva tu plaza.') +
      '<section class="sec"><div class="wrap cal-layout"><div class="rv"><div class="cal" id="cal"><div class="cal-h"><button class="cal-b" type="button" data-cal-prev aria-label="Mes anterior">' + ic('left') + '</button><h2 aria-live="polite" data-cal-title></h2><button class="cal-b" type="button" data-cal-next aria-label="Mes siguiente">' + ic('right') + '</button></div><div class="cal-g" data-cal-grid></div></div><div class="evs" data-cal-sel style="margin-top:14px"></div></div>' +
      '<div class="cal-l"><span class="eyebrow">Salidas</span><h2>Todas las actividades</h2>' + (SAL.items.length ? evList(dated.concat(undated)) : '<p class="empty-n">Todavía no hay actividades publicadas.</p>') + '</div></div></section>' +
      '<script type="application/json" id="salidas-data">' + JSON.stringify(dated.map(e => ({ f: String(e.fecha).slice(0, 10), t: evTitle(e), h: e.hora || '', u: routeById(e.ruta) ? rUrl(routeById(e.ruta)) : '' }))).replace(/</g, '\\u003c') + '</script>' + ctaBand()
  });
})();

/* ---- Servicios ---- */
page('servicios', {
  title: 'Servicios de senderismo guiado en la Sierra de Guadarrama | ' + NAME,
  desc: 'Servicios de ' + NAME + ': rutas guiadas y experiencias de montaña en la Sierra de Guadarrama, Comunidad de Madrid.',
  nav: 'servicios',
  body: phead('Servicios', 'Servicios', stripProv(SERV.intro || 'Lo que hacemos en la montaña.')) + '<section class="sec"><div class="wrap"><div class="svcs big">' + SERV.items.map(serviceCard).join('') + '</div></div></section>' + ctaBand()
});

/* ---- Nosotros ---- */
page('nosotros', {
  title: 'Quiénes somos | ' + NAME,
  desc: 'Conoce al equipo de ' + NAME + ', guías de rutas por la Sierra de Guadarrama.',
  nav: 'nosotros',
  body: phead('Nosotros', 'Quiénes somos', NAME + ' organiza rutas guiadas por la Sierra de Guadarrama.') +
    '<section class="sec"><div class="wrap split"><div class="prose rv"><span class="eyebrow">Nuestra historia</span><h2>' + T(NOS.titulo || 'PROVISIONAL: Cómo nació el proyecto') + '</h2>' + md(NOS.historia || 'PROVISIONAL: Aquí irá la historia de la empresa.', { shift: 2 }) + '</div><div class="rv">' + pic(NOS.imagen, 'Equipo en la Sierra de Guadarrama', { seed: 27, mood: 'dia', cls: 'r32 tilt' }) + '</div></div></section>' +
    '<section class="sec alt"><div class="wrap">' + ((NOS.disciplinas || []).length ? '<ul class="tags rv" aria-label="Disciplinas que practica">' + NOS.disciplinas.map(d => '<li>' + esc(d) + '</li>').join('') + '</ul>' : '') + SECTION_HEAD('Valores', 'Qué nos mueve') + '<div class="vals">' + (NOS.valores || []).map(v => '<div class="val rv"><h3>' + T(v.titulo) + '</h3><p>' + T(v.texto) + '</p></div>').join('') + '</div></div></section>' +
    '<section class="sec"><div class="wrap">' + SECTION_HEAD('Equipo', 'Las personas detrás de las rutas') + '<div class="team">' + (NOS.equipo || []).map(m => '<article class="member rv">' + (has(m.foto) ? '<figure class="ph avatar-p"><img src="' + esc(m.foto) + '" alt="' + esc(stripProv(m.nombre)) + '" loading="lazy"></figure>' : '<div class="avatar">' + ic('user', 34) + '<span>Foto por añadir</span></div>') + '<h3>' + T(m.nombre) + '</h3><p class="role">' + T(m.cargo) + '</p><p>' + T(m.bio) + '</p></article>').join('') + '</div></div></section>' +
    '<section class="sec alt"><div class="wrap narrow">' + SECTION_HEAD('Trayectoria', 'Formación y trayectoria') + '<div class="prose rv">' + md(NOS.titulaciones || 'PROVISIONAL: Aquí se indicarán las titulaciones de los guías, el seguro y las acreditaciones de la empresa.', { shift: 2 }) + '</div></div></section>' + ctaBand()
});

/* ---- Opiniones ---- */
page('opiniones', {
  title: 'Opiniones de quienes caminan con nosotros | ' + NAME,
  desc: 'Opiniones, puntuación media y valoraciones publicadas por quienes han hecho rutas guiadas con ' + NAME + ' en la Sierra de Guadarrama. Comparte la tuya.',
  nav: 'opiniones',
  image: has(OPIP.imagen) ? OPIP.imagen : null,
  body: phead('Opiniones', 'Opiniones de quienes caminan con nosotros', 'Lee lo que cuentan otras personas y, si has caminado con nosotros, deja tu valoración. No hace falta registrarse.') +
    (has(OPIP.imagen) ? '<div class="wrap op-hero-w"><figure class="op-hero"><img src="' + esc(OPIP.imagen) + '" alt="' + esc(OPIP.descripcion || '') + '" width="1600" height="720" fetchpriority="high" decoding="async"></figure></div>' : '') +
    '<section class="sec"><div class="wrap val-page">' + quoteCards(true) + '</div></section>' + ctaBand()
});

/* ---- Galería ---- */
(function () {
  const chips = '<button class="chip" type="button" data-filter="" aria-pressed="true">Todas</button>' + RUTAS.map(r => '<button class="chip" type="button" data-filter="' + r.id + '" aria-pressed="false">' + esc(r.titulo) + '</button>').join('');
  page('galeria', {
    title: 'Galería de fotografías de la Sierra de Guadarrama | ' + NAME,
    desc: 'Fotografías de las rutas guiadas por la Sierra de Guadarrama: paisajes, senderos y bosques.',
    nav: 'galeria',
    body: phead('Galería', 'Galería de fotografías', 'Paisajes, senderos y momentos de nuestras salidas. Pulsa una imagen para ampliarla.') +
      '<section class="sec"><div class="wrap"><div class="chips" role="group" aria-label="Filtrar por ruta">' + chips + '</div><div class="gal" data-gal>' + galleryItems() + '</div><p class="empty-n" data-gal-empty hidden>No hay fotografías de esta ruta todavía.</p></div></section>' + ctaBand()
  });
})();

/* ---- Blog ---- */
page('blog', {
  title: 'Blog y novedades sobre rutas en la Sierra de Guadarrama | ' + NAME,
  desc: 'Novedades, consejos y artículos sobre senderismo en la Sierra de Guadarrama.',
  nav: 'blog',
  body: phead('Blog', 'Blog y novedades', 'Consejos, novedades y noticias de nuestras rutas.') + '<section class="sec"><div class="wrap">' + (POSTS.length ? '<div class="grid">' + POSTS.map(blogCard).join('') + '</div>' : '<p class="empty-n">Todavía no hay artículos publicados.</p>') + '</div></section>' + ctaBand()
});
POSTS.forEach(p => {
  const seed = hashSeed(p.slug);
  const heroImg = has(p.imagen) ? p.imagen : phUrl(moodFor(seed), seed);
  const body = phead('<a href="/blog/">Blog</a>', T(p.titulo), '<time datetime="' + esc(String(p.fecha).slice(0, 10)) + '">' + esc(fmtDate(p.fecha)) + '</time>') +
    '<article class="sec"><div class="wrap narrow">' + '<figure class="ph r169 rv"><img src="' + esc(heroImg) + '" alt="" fetchpriority="high">' + (!has(p.imagen) && AVISOS ? '<span class="ph-tag">Foto provisional</span>' : '') + '</figure><div class="prose article rv">' + md(p.body, { shift: 1 }) + '</div><p><a class="link" href="/blog/">← Volver al blog</a></p></div></article>' + ctaBand();
  page('blog/' + p.slug, {
    title: stripProv(p.titulo) + ' | Blog ' + NAME,
    desc: stripProv(p.resumen) || stripProv(p.titulo), nav: 'blog', body, ogType: 'article', image: has(p.imagen) ? p.imagen : null,
    ld: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: stripProv(p.titulo), datePublished: String(p.fecha).slice(0, 10), inLanguage: 'es', author: { '@type': 'Organization', name: NAME } }]
  });
});

/* ---- Preguntas frecuentes ---- */
page('preguntas-frecuentes', {
  title: 'Preguntas frecuentes sobre las rutas guiadas | ' + NAME,
  desc: 'Respuestas a las dudas más habituales sobre nuestras excursiones guiadas por la Sierra de Guadarrama: reservas, material, dificultad y más.',
  nav: 'preguntas-frecuentes',
  body: phead('Preguntas frecuentes', 'Preguntas frecuentes', 'Resolvemos las dudas habituales antes de reservar.') + '<section class="sec"><div class="wrap narrow">' + faqList(FAQ.items) + '</div></section>' + ctaBand('¿No encuentras tu respuesta?', 'Escríbenos y te respondemos.'),
  ld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.items.filter(f => has(f.respuesta) && !isProv(f.respuesta) && !isProv(f.pregunta)).map(f => ({ '@type': 'Question', name: f.pregunta, acceptedAnswer: { '@type': 'Answer', text: f.respuesta } })) }].filter(x => x.mainEntity.length)
});

/* ---- Contacto ---- */
(function () {
  const ropts = '<option value="">Elige una ruta…</option>' + RUTAS.map(r => '<option value="' + esc(r.id) + '">' + esc(r.titulo) + '</option>').join('') + '<option value="otra">Otra consulta</option>';
  const row = (icon, label, val) => '<div class="crow">' + ic(icon, 22) + '<div><dt>' + label + '</dt><dd>' + val + '</dd></div></div>';
  page('contacto', {
    title: 'Contacto y reservas | ' + NAME,
    desc: 'Reserva tu excursión guiada por la Sierra de Guadarrama o resuelve tus dudas: formulario de contacto y WhatsApp.',
    nav: 'contacto',
    body: phead('Contacto', 'Contacto y reservas', 'Solicita tu plaza o escríbenos si tienes dudas sobre una ruta.') +
      '<section class="sec"><div class="wrap">' + quickMsgs() + '</div></section><section class="sec alt"><div class="wrap two"><div id="formulario" class="rv"><h2>O escríbenos con el formulario</h2><div id="form-ok" class="done" hidden tabindex="-1"><h3>Mensaje enviado</h3><p>Gracias. Hemos recibido tu consulta y te responderemos lo antes posible.</p></div>' +
      '<form name="contacto" method="POST" action="/gracias/" data-netlify="true" netlify-honeypot="bot-field" id="contact-form" novalidate><input type="hidden" name="form-name" value="contacto"><p class="hp" hidden><label>No rellenar: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>' +
      '<div class="fg"><label for="f-nombre">Nombre y apellidos<input id="f-nombre" name="nombre" autocomplete="name" required><span class="err" data-err></span></label>' +
      '<label for="f-email">Correo electrónico<input id="f-email" name="email" type="email" autocomplete="email" required><span class="err" data-err></span></label>' +
      '<label for="f-tel">Teléfono (opcional)<input id="f-tel" name="telefono" type="tel" autocomplete="tel"></label>' +
      '<label for="f-pers">Número de personas<input id="f-pers" name="personas" type="number" min="1" value="1" required><span class="err" data-err></span></label>' +
      '<label for="f-ruta">Ruta<select id="f-ruta" name="ruta">' + ropts + '</select></label>' +
      '<label for="f-fecha">Fecha preferida (opcional)<input id="f-fecha" name="fecha" type="date"></label>' +
      '<label class="full" for="f-msg">Mensaje<textarea id="f-msg" name="mensaje" rows="5" required></textarea><span class="err" data-err></span></label>' +
      '<div class="full"><label class="check" for="f-ok"><input id="f-ok" name="privacidad" type="checkbox" required><span>He leído y acepto la <a href="/legal/">política de privacidad</a>.</span></label><span class="err" data-err></span></div></div>' +
      '<p class="form-err" id="form-err" role="alert" hidden>No se ha podido enviar el mensaje. Inténtalo de nuevo o escríbenos por WhatsApp.</p><div><button class="btn btn-a" type="submit">Enviar mensaje</button></div></form></div>' +
      '<aside class="side rv">' + BTN_WA(MSG_GEN, 'Escribir por WhatsApp', 'full') +
      '<div class="info"><h3>Datos de contacto</h3><dl>' +
      row('wa', 'WhatsApp', waNum ? '<a href="' + wa() + '" target="_blank" rel="noopener">' + esc(waPretty()) + '</a>' : '<mark class="prov">Número por confirmar</mark>') +
      row('mail', 'Correo', EMAIL ? '<a href="mailto:' + esc(EMAIL) + '">' + esc(EMAIL) + '</a>' : '<mark class="prov">Correo por confirmar</mark>') +
      (TEL ? row('phone', 'Teléfono', '<a href="tel:' + esc(TEL.replace(/[^\d+]/g, '')) + '">' + esc(TEL) + '</a>') : '') +
      (INSTA_URL ? row('insta', 'Instagram', '<a href="' + esc(INSTA_URL) + '" target="_blank" rel="noopener">@' + esc(INSTA_HANDLE) + '</a>') : '') +
      row('pin', 'Zona', 'Sierra de Guadarrama, Comunidad de Madrid') + '</dl></div>' + communityBlock('card') + mapBlock() + '</aside></div></section>'
  });
  page('gracias', {
    title: 'Mensaje enviado | ' + NAME, desc: 'Hemos recibido tu mensaje.', noindex: true, nav: 'contacto',
    body: phead('Contacto', 'Mensaje enviado', 'Gracias. Hemos recibido tu consulta y te responderemos lo antes posible.') + '<section class="sec"><div class="wrap"><a class="btn btn-a" href="/">Volver al inicio</a></div></section>'
  });
})();

/* ---- Legal y 404 ---- */
page('legal', {
  title: 'Aviso legal y política de privacidad | ' + NAME, desc: 'Aviso legal y política de privacidad.', noindex: true,
  body: phead('Legal', 'Aviso legal y privacidad') + '<section class="sec"><div class="wrap narrow"><div class="prose">' + md(LEGAL.texto || 'PROVISIONAL: Texto legal pendiente.', { shift: 2 }) + '</div></div></section>'
});
page('404.html', {
  title: 'Página no encontrada | ' + NAME, desc: 'Esta página no existe.', noindex: true,
  body: phead('Error', 'Esta página no existe', 'Puede que el enlace haya cambiado.') + '<section class="sec"><div class="wrap"><div class="cta-row"><a class="btn btn-a" href="/">Volver al inicio</a><a class="btn btn-o" href="/rutas/">Ver las rutas</a></div></div></section>'
});

/* =====================================================================
   ARCHIVOS ESTÁTICOS
   ===================================================================== */
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    fs.statSync(a).isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
copyDir(SRC, OUT);
const phDir = path.join(OUT, 'img', 'placeholders');
fs.mkdirSync(phDir, { recursive: true });
PH.forEach(([seed, mood], name) => fs.writeFileSync(path.join(phDir, name), landscapeSVG(seed, mood)));
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /admin/\n' + (BASE ? 'Sitemap: ' + BASE + '/sitemap.xml\n' : ''));
if (BASE) fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + SITEMAP.map(u => '  <url><loc>' + BASE + u + '</loc></url>').join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(OUT, '_headers'), '/moderar/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/img/*\n  Cache-Control: public, max-age=604800\n/favicon.svg\n  Cache-Control: public, max-age=604800\n');

console.log('✔ Web generada en dist/ · ' + SITEMAP.length + ' páginas · ' + RUTAS.length + ' rutas · ' + POSTS.length + ' artículos · ' + PH.size + ' ilustraciones provisionales');
if (!BASE) console.log('ℹ Falta la dirección web (content/ajustes.json → url_sitio). Sin ella no se genera sitemap.xml ni las etiquetas canónicas. En Netlify se completa sola.');
