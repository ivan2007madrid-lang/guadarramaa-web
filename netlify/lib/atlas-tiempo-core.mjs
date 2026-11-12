/* Guadarramaa.guidess · Atlas · semáforo de montaña.
   Lee datos REALES de AEMET OpenData (observación, previsión por municipio y avisos CAP) y calcula un semáforo orientativo
   con umbrales editables (content/atlas.json). Nunca inventa datos: si una fuente falla, lo dice ("sin datos").
   La clave de AEMET se lee de la variable de entorno AEMET_API_KEY de Netlify; no está en ningún archivo. */
import { gunzipSync } from 'node:zlib';

export const AEMET = 'https://opendata.aemet.es/opendata/api';
export const TTL_MS = 30 * 60 * 1000;          // los datos se reutilizan 30 minutos (ahorra llamadas y créditos)
export const TTL_MAESTRO_MS = 30 * 24 * 3600 * 1000;

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = v => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const maxN = a => { const v = a.filter(x => x !== null); return v.length ? Math.max(...v) : null; };
const minN = a => { const v = a.filter(x => x !== null); return v.length ? Math.min(...v) : null; };
const redondea = (n, d = 0) => n === null ? null : Math.round(n * 10 ** d) / 10 ** d;
const kmh = ms => ms === null ? null : redondea(ms * 3.6);
const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const dirTexto = g => g === null ? null : PUNTOS[Math.round((((g % 360) + 360) % 360) / 45) % 8];

/* ── Decodificación (AEMET a veces responde en ISO-8859-1) ───────── */
export function decodifica(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('iso-8859-1').decode(u8); }
}

/* ── Acceso a AEMET: dos pasos (1.º devuelve una URL "datos", 2.º los datos) ── */
export async function aemetGet(ruta, key, f = fetch, { binario = false } = {}) {
  const r1 = await f(AEMET + ruta, { headers: { api_key: key, accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (r1.status === 429) throw new Error('AEMET: demasiadas consultas (429)');
  if (r1.status === 401 || r1.status === 403) throw new Error('AEMET: la clave no es válida o ha caducado');
  let j; try { j = JSON.parse(decodifica(new Uint8Array(await r1.arrayBuffer()))); } catch (e) { throw new Error('AEMET: respuesta no válida'); }
  if (j.estado !== 200 || !j.datos) throw new Error('AEMET: ' + (j.descripcion || 'sin datos') + (j.estado ? ' (' + j.estado + ')' : ''));
  const r2 = await f(j.datos, { signal: AbortSignal.timeout(12000) });
  if (!r2.ok) throw new Error('AEMET: no se pudieron descargar los datos (' + r2.status + ')');
  const buf = new Uint8Array(await r2.arrayBuffer());
  return binario ? buf : JSON.parse(decodifica(buf));
}

/* ── Avisos CAP: archivo .tar (o .tar.gz) con un XML por aviso ──── */
export function leerTar(buf) {
  let u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = new Uint8Array(gunzipSync(u8));
  const out = []; let p = 0;
  while (p + 512 <= u8.length) {
    const cab = u8.subarray(p, p + 512);
    if (cab.every(b => b === 0)) break;
    const nombre = decodifica(cab.subarray(0, 100)).replace(/\0.*$/s, '');
    const tam = parseInt(decodifica(cab.subarray(124, 136)).replace(/\0.*$/s, '').trim() || '0', 8) || 0;
    const tipo = String.fromCharCode(cab[156] || 48);
    if (tipo === '0' || tipo === '\0') out.push({ nombre, datos: u8.subarray(p + 512, p + 512 + tam) });
    p += 512 + Math.ceil(tam / 512) * 512;
  }
  return out;
}
const etiqueta = (xml, t) => { const m = xml.match(new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>', 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
const entidades = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function parametro(info, nombre) {
  const re = /<parameter>([\s\S]*?)<\/parameter>/gi; let m;
  while ((m = re.exec(info))) { if (etiqueta(m[1], 'valueName') === nombre) return etiqueta(m[1], 'value'); }
  return '';
}
/* Devuelve los avisos (en español) de un XML CAP de AEMET. */
export function parseCAP(xml) {
  const estado = etiqueta(xml, 'status'), tipoMsg = etiqueta(xml, 'msgType');
  if (/cancel/i.test(tipoMsg)) return [];
  if (estado && !/actual/i.test(estado)) return [];
  const res = []; const re = /<info>([\s\S]*?)<\/info>/gi; let m;
  while ((m = re.exec(xml))) {
    const info = m[1];
    if (!/^es/i.test(etiqueta(info, 'language'))) continue;
    const nivel = parametro(info, 'AEMET-Meteoalerta nivel').toLowerCase();
    const zonaGeo = (() => { const g = etiqueta(info, 'geocode'); return etiqueta(g, 'value'); })();
    res.push({
      evento: entidades(etiqueta(info, 'event')), titular: entidades(etiqueta(info, 'headline')),
      descripcion: entidades(etiqueta(info, 'description')), nivel, severidad: etiqueta(info, 'severity'),
      zona: entidades(etiqueta(info, 'areaDesc')), zonaCodigo: zonaGeo,
      desde: etiqueta(info, 'onset') || etiqueta(info, 'effective'), hasta: etiqueta(info, 'expires'),
      parametro: entidades(parametro(info, 'AEMET-Meteoalerta parametro'))
    });
  }
  return res;
}
export function avisosDeTar(buf, textos, ahora) {
  const t = (textos && textos.length ? textos : ['Guadarrama']).map(norm);
  const todos = [];
  for (const f of leerTar(buf)) { if (/\.xml$/i.test(f.nombre)) todos.push(...parseCAP(decodifica(f.datos))); }
  return todos.filter(a => t.some(x => norm(a.zona).includes(x)))
    .filter(a => !a.hasta || new Date(a.hasta).getTime() >= ahora)
    .filter(a => a.nivel === 'amarillo' || a.nivel === 'naranja' || a.nivel === 'rojo')
    .sort((a, b) => (b.nivel === 'rojo') - (a.nivel === 'rojo') || (b.nivel === 'naranja') - (a.nivel === 'naranja') || String(a.desde).localeCompare(String(b.desde)));
}

/* ── Observación (última hora disponible) ───────────────────────── */
export function parseObservacion(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const ord = lista.slice().sort((a, b) => String(a.fint).localeCompare(String(b.fint)));
  const o = ord.reverse().find(x => num(x.ta) !== null || num(x.vv) !== null) || null;
  if (!o) return null;
  return { hora: o.fint, ta: num(o.ta), viento: kmh(num(o.vv)), racha: kmh(num(o.vmax)), dir: dirTexto(num(o.dv)), prec: num(o.prec), nieve: num(o.nieve), hr: num(o.hr), alt: num(o.alt), estacion: o.ubi || null };
}

/* ── Previsión municipal diaria ─────────────────────────────────── */
export function parsePrevision(json, dias = 3) {
  const p = Array.isArray(json) ? json[0] : json;
  const lista = p && p.prediccion && p.prediccion.dia; if (!Array.isArray(lista)) return null;
  const vals = (arr, f = x => num(x.value)) => Array.isArray(arr) ? arr.map(f) : [];
  return {
    nombre: p.nombre || '', elaborado: p.elaborado || '',
    dias: lista.slice(0, dias).map(d => {
      const cielo = Array.isArray(d.estadoCielo) ? (d.estadoCielo.find(x => x.periodo === '00-24' && x.descripcion) || d.estadoCielo.find(x => x.descripcion)) : null;
      const vientos = Array.isArray(d.viento) ? d.viento : [];
      const vmax = vientos.reduce((m, x) => (num(x.velocidad) !== null && (m === null || num(x.velocidad) > num(m.velocidad))) ? x : m, null);
      return {
        fecha: String(d.fecha || '').slice(0, 10),
        tmax: num(d.temperatura && d.temperatura.maxima), tmin: num(d.temperatura && d.temperatura.minima),
        probLluvia: maxN(vals(d.probPrecipitacion)), cotaNieve: minN(vals(d.cotaNieveProv)),
        viento: maxN(vientos.map(x => num(x.velocidad))), vientoDir: vmax ? vmax.direccion || null : null,
        racha: maxN(vals(d.rachaMax)), cielo: cielo ? cielo.descripcion : null
      };
    })
  };
}

/* ── Municipio por nombre (así no dependemos de recordar códigos INE) ── */
export function resolverMunicipio(maestro, zona) {
  if (zona.ine) return String(zona.ine).replace(/\D/g, '');
  const nombres = [zona.municipio].concat(zona.alias_municipio || []).filter(Boolean).map(norm);
  const lista = Array.isArray(maestro) ? maestro : [];
  const hit = lista.find(m => /^id28/.test(m.id || '') && nombres.includes(norm(m.nombre)));
  return hit ? String(hit.id).replace(/\D/g, '') : null;
}

/* ── Semáforo: reglas visibles y editables ──────────────────────── */
export const UMBRALES = {
  racha_ambar: 50, racha_rojo: 70,          // km/h
  viento_ambar: 35, viento_rojo: 55,        // km/h (viento medio)
  lluvia_ambar: 60, lluvia_rojo: 90,        // % probabilidad
  prec_ambar: 1, prec_rojo: 5,              // mm en la última hora (observado)
  tmax_ambar: 32, tmin_ambar: -3,           // °C
  nieve_suelo_ambar: 1                      // cm de nieve en el suelo (estación)
};
const ORDEN = { verde: 0, ambar: 1, rojo: 2 };
const fechaDe = d => String(d).slice(0, 10);
export function evaluar({ ahora = null, dia = null, avisos = [], altitudRef = null, fecha = null }, u = UMBRALES) {
  const m = []; const add = (nivel, texto) => m.push({ nivel, texto });
  const U = { ...UMBRALES, ...u };
  if (ahora) {
    const r = ahora.racha, v = ahora.viento;
    if (r !== null && r >= U.racha_rojo) add('rojo', 'Rachas de ' + r + ' km/h medidas ahora'); else if (r !== null && r >= U.racha_ambar) add('ambar', 'Rachas de ' + r + ' km/h medidas ahora');
    if (v !== null && v >= U.viento_rojo) add('rojo', 'Viento medio de ' + v + ' km/h medido ahora'); else if (v !== null && v >= U.viento_ambar) add('ambar', 'Viento medio de ' + v + ' km/h medido ahora');
    if (ahora.prec !== null && ahora.prec >= U.prec_rojo) add('rojo', 'Lluvia intensa ahora (' + ahora.prec + ' mm en la última hora)'); else if (ahora.prec !== null && ahora.prec >= U.prec_ambar) add('ambar', 'Está lloviendo ahora (' + ahora.prec + ' mm en la última hora)');
    if (ahora.nieve !== null && ahora.nieve >= U.nieve_suelo_ambar) add('ambar', 'Nieve en el suelo en la estación (' + ahora.nieve + ' cm)');
  }
  if (dia) {
    if (dia.racha !== null && dia.racha >= U.racha_rojo) add('rojo', 'Rachas previstas de hasta ' + dia.racha + ' km/h'); else if (dia.racha !== null && dia.racha >= U.racha_ambar) add('ambar', 'Rachas previstas de hasta ' + dia.racha + ' km/h');
    if (dia.viento !== null && dia.viento >= U.viento_rojo) add('rojo', 'Viento previsto de hasta ' + dia.viento + ' km/h'); else if (dia.viento !== null && dia.viento >= U.viento_ambar) add('ambar', 'Viento previsto de hasta ' + dia.viento + ' km/h');
    if (dia.probLluvia !== null && dia.probLluvia >= U.lluvia_rojo) add('rojo', 'Probabilidad de precipitación del ' + dia.probLluvia + ' %'); else if (dia.probLluvia !== null && dia.probLluvia >= U.lluvia_ambar) add('ambar', 'Probabilidad de precipitación del ' + dia.probLluvia + ' %');
    if (dia.cotaNieve !== null && altitudRef !== null && dia.cotaNieve <= altitudRef) add('ambar', 'Cota de nieve prevista a ' + dia.cotaNieve + ' m (la zona llega a ' + Math.round(altitudRef) + ' m)');
    if (dia.tmax !== null && dia.tmax >= U.tmax_ambar) add('ambar', 'Máxima prevista de ' + dia.tmax + ' °C'); if (dia.tmin !== null && dia.tmin <= U.tmin_ambar) add('ambar', 'Mínima prevista de ' + dia.tmin + ' °C');
  }
  for (const a of avisos) {
    if (fecha && a.desde && a.hasta && !(fechaDe(a.desde) <= fecha && fecha <= fechaDe(a.hasta))) continue;
    add(a.nivel === 'amarillo' ? 'ambar' : 'rojo', 'AEMET · ' + (a.titular || a.evento));
  }
  const tieneDatos = !!(ahora || dia || avisos.length);
  const estado = !tieneDatos ? 'sin-datos' : m.reduce((p, x) => ORDEN[x.nivel] > ORDEN[p] ? x.nivel : p, 'verde');
  return { estado, motivos: m };
}

/* ── Construcción del paquete que recibe la web ─────────────────── */
export async function construir(cfg, key, f = fetch, ahoraMs = Date.now(), prev = null) {
  const u = { ...UMBRALES, ...(cfg.umbrales || {}) };
  const zonas = Array.isArray(cfg.zonas) ? cfg.zonas : [];
  const paquete = { ok: true, configurado: true, generado: new Date(ahoraMs).toISOString(), fuente: 'AEMET (Agencia Estatal de Meteorología) · datos abiertos', umbrales: u, zonas: {}, avisos: [], avisosEstado: { ok: false, motivo: '' } };

  /* Avisos oficiales (CAP) de la Comunidad de Madrid */
  let avisosTodos = [];
  try {
    const area = String(cfg.avisos_area || '72');
    const tar = await aemetGet('/avisos_cap/ultimoelaborado/area/' + encodeURIComponent(area), key, f, { binario: true });
    avisosTodos = avisosDeTar(tar, cfg.avisos_texto, ahoraMs);
    paquete.avisosEstado = { ok: true, motivo: '' };
  } catch (e) { paquete.avisosEstado = { ok: false, motivo: String(e.message || e) }; }
  paquete.avisos = avisosTodos;

  /* Municipios (solo hace falta si alguna zona no trae código INE) */
  let maestro = (prev && prev.maestro) || null; let maestroNuevo = null;
  if (!maestro && zonas.some(z => !z.ine)) {
    try {
      const lista = await aemetGet('/maestro/municipios', key, f);
      maestroNuevo = (Array.isArray(lista) ? lista : []).filter(m => /^id28/.test(m.id || '')).map(m => ({ id: m.id, nombre: m.nombre }));
      maestro = maestroNuevo;
    } catch (e) { maestro = null; }
  }

  for (const z of zonas) {
    const info = { nombre: z.nombre, estacion: z.estacion_nombre || null, fuentes: { observacion: { ok: false, motivo: z.estacion ? '' : 'Sin estación asignada' }, prevision: { ok: false, motivo: '' }, avisos: paquete.avisosEstado }, ahora: null, dias: [] };
    const textos = (z.avisos_texto && z.avisos_texto.length) ? z.avisos_texto : (cfg.avisos_texto || ['Guadarrama']);
    const avisosZ = avisosTodos.filter(a => textos.map(norm).some(x => norm(a.zona).includes(x)));
    if (z.estacion) {
      try { const o = parseObservacion(await aemetGet('/observacion/convencional/datos/estacion/' + encodeURIComponent(z.estacion), key, f)); if (o) { info.ahora = o; info.fuentes.observacion = { ok: true, motivo: '' }; } else info.fuentes.observacion = { ok: false, motivo: 'La estación no devolvió datos' }; }
      catch (e) { info.fuentes.observacion = { ok: false, motivo: String(e.message || e) }; }
    }
    const ine = resolverMunicipio(maestro, z);
    if (!ine) info.fuentes.prevision = { ok: false, motivo: 'No se encontró el municipio «' + z.municipio + '» en AEMET' };
    else {
      try {
        const p = parsePrevision(await aemetGet('/prediccion/especifica/municipio/diaria/' + ine, key, f));
        const esperados = [z.municipio].concat(z.alias_municipio || []).filter(Boolean).map(norm);
        if (!p) info.fuentes.prevision = { ok: false, motivo: 'AEMET no devolvió previsión' };
        else if (z.ine && esperados.length && !esperados.includes(norm(p.nombre))) info.fuentes.prevision = { ok: false, motivo: 'El código INE no corresponde a «' + z.municipio + '» (AEMET devuelve «' + p.nombre + '»)' };
        else { info.dias = p.dias; info.elaborado = p.elaborado; info.fuentes.prevision = { ok: true, motivo: '' }; }
      } catch (e) { info.fuentes.prevision = { ok: false, motivo: String(e.message || e) }; }
    }
    const alt = typeof z.altitud_ref === 'number' ? z.altitud_ref : null;
    info.altitudRef = alt;
    const hoyFecha = info.dias[0] ? info.dias[0].fecha : null;
    const ev0 = evaluar({ ahora: info.ahora, dia: info.dias[0] || null, avisos: avisosZ, altitudRef: alt, fecha: hoyFecha }, u);
    info.estado = ev0.estado; info.motivos = ev0.motivos;
    info.dias = info.dias.map((d, i) => ({ ...d, ...(i === 0 ? { estado: ev0.estado, motivos: ev0.motivos } : evaluar({ dia: d, avisos: avisosZ, altitudRef: alt, fecha: d.fecha }, u)) }));
    info.avisos = avisosZ;
    paquete.zonas[z.id] = info;
  }
  return { paquete, maestroNuevo };
}

/* ── Manejador HTTP (la función de Netlify solo pasa dependencias) ── */
const out = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { ...JSON_H, ...extra } });
export async function handleTiempo(req, ctx, deps) {
  const { store, env = {}, now = Date.now, f = fetch, cargarCfg } = deps;
  if (req.method !== 'GET') return out({ ok: false, mensaje: 'Método no permitido.' }, 405);
  const key = env.AEMET_API_KEY;
  if (!key) return out({ ok: true, configurado: false, mensaje: 'El semáforo aún no está activado: falta la clave de AEMET en Netlify.' }, 200, { 'cache-control': 'public, max-age=60' });
  try {
    const snap = await store.get('snap', { type: 'json' });
    if (snap && now() - Date.parse(snap.generado) < TTL_MS) return out(snap, 200, { 'cache-control': 'public, max-age=60, s-maxage=300' });
    const cfg = await cargarCfg();
    const prev = {}; const mae = await store.get('maestro', { type: 'json' });
    if (mae && now() - mae.t < TTL_MAESTRO_MS) prev.maestro = mae.lista;
    try {
      const { paquete, maestroNuevo } = await construir(cfg, key, f, now(), prev);
      if (maestroNuevo && maestroNuevo.length) await store.setJSON('maestro', { t: now(), lista: maestroNuevo });
      const sinNada = Object.values(paquete.zonas).every(z => z.estado === 'sin-datos') && !paquete.avisosEstado.ok;
      if (sinNada) {   // AEMET no ha respondido: no se guarda (se reintenta en la siguiente visita) y, si hay datos anteriores, se enseñan marcados como antiguos
        if (snap) return out({ ...snap, obsoleto: true }, 200, { 'cache-control': 'public, max-age=30' });
        return out(paquete, 200, { 'cache-control': 'public, max-age=30' });
      }
      await store.setJSON('snap', paquete);
      return out(paquete, 200, { 'cache-control': 'public, max-age=60, s-maxage=300' });
    } catch (e) {
      if (snap) return out({ ...snap, obsoleto: true }, 200, { 'cache-control': 'public, max-age=30' });
      throw e;
    }
  } catch (e) {
    return out({ ok: false, configurado: true, mensaje: 'No se han podido obtener los datos de AEMET ahora mismo.' }, 200, { 'cache-control': 'no-store' });
  }
}
