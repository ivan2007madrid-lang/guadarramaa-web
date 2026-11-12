/* Guadarramaa.guidess · Pasaporte montañero: códigos exclusivos que entrega el guía tras cada salida.
   Sin registro ni datos personales: un código = un sello. La contraseña de administrador vive en una variable de Netlify. */
import { createHash, timingSafeEqual, randomInt } from 'node:crypto';

export const LIMITES = { fallosHora: 10, intentosDia: 60, maxCodigos: 30, intentosAdmin: 8 };
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // sin 0/O/1/I para no confundir al teclear
const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const out = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { ...JSON_H, 'cache-control': 'no-store', ...extra } });
const err = (status, mensaje) => out({ ok: false, mensaje }, status);
const sha = s => createHash('sha256').update(s).digest('hex');
const pad2 = n => String(n).padStart(2, '0');
const hora = d => d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + pad2(d.getUTCHours());
const dia = d => hora(d).slice(0, 8);
const q15 = d => hora(d) + pad2(Math.floor(d.getUTCMinutes() / 15));

function ipHash(req, ctx, env) {
  const ip = (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';
  return sha(ip + '|' + (env.VALORACIONES_SAL || 'guadarramaa')).slice(0, 24);
}
export function normalizaCodigo(s) {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sin = t.startsWith('GGU') ? t.slice(3) : t;
  return /^[A-Z2-9]{8}$/.test(sin) && !/[01OI]/.test(sin) ? sin : null;
}
export const formatoCodigo = c => 'GGU-' + c.slice(0, 4) + '-' + c.slice(4);
const nuevoCodigo = () => Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const cuenta = async (lim, k) => { const v = await lim.get(k, { type: 'json' }); return v && v.n ? v.n : 0; };
const suma = async (lim, k) => { const n = await cuenta(lim, k); await lim.setJSON(k, { n: n + 1 }); return n + 1; };
const mismoOrigen = req => { try { const o = req.headers.get('origin'); return !!o && new URL(o).host === new URL(req.url).host; } catch (e) { return false; } };
const num = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n < 10000 ? n : null; };
const fechaOk = (s, ahora) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && Date.parse(s) <= ahora + 36 * 3600e3 && Date.parse(s) > Date.parse('2020-01-01');
const publico = (c, v) => ({ codigo: formatoCodigo(c), ruta: v.ruta, titulo: v.titulo, fecha: v.fecha, km: v.km, desnivel: v.desnivel });

/* POST /api/pasaporte {codigo} → devuelve el sello. Repetir un código ya canjeado devuelve el mismo sello (sirve para recuperar el pasaporte). */
export async function handleCanje(req, ctx, deps) {
  const { store, limites, env = {}, now = Date.now } = deps;
  try {
    if (req.method !== 'POST') return err(405, 'Método no permitido.');
    if (!mismoOrigen(req)) return err(403, 'Origen no permitido.');
    let b; try { b = await req.json(); } catch (e) { return err(400, 'Datos no válidos.'); }
    const d = new Date(now()), ip = ipHash(req, ctx, env);
    const kF = 'f/' + ip + '/' + hora(d), kD = 'd/' + ip + '/' + dia(d);
    if (await cuenta(limites, kF) >= LIMITES.fallosHora || await cuenta(limites, kD) >= LIMITES.intentosDia) return err(429, 'Demasiados intentos. Prueba de nuevo más tarde.');
    await suma(limites, kD);
    const c = normalizaCodigo(b && b.codigo);
    const v = c ? await store.get('c/' + c, { type: 'json' }) : null;
    if (!v || v.revocado) { await suma(limites, kF); return err(404, 'Ese código no es válido. Revisa que lo has escrito igual que te lo dieron.'); }
    if (!v.canjeado) { v.canjeado = new Date(now()).toISOString(); await store.setJSON('c/' + c, v); }
    return out({ ok: true, sello: publico(c, v) });
  } catch (e) { return err(500, 'Error inesperado. Inténtalo de nuevo.'); }
}

/* Administración (solo con contraseña): GET lista · POST generar / revocar / restaurar / eliminar */
function passwordOk(req, env) {
  const esperada = env.ATLAS_ADMIN || env.VALORACIONES_ADMIN;
  if (!esperada || esperada.length < 8) return null;
  const dada = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return timingSafeEqual(createHash('sha256').update(dada).digest(), createHash('sha256').update(esperada).digest());
}
export async function handleAdmin(req, ctx, deps) {
  const { store, limites, env = {}, now = Date.now } = deps;
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return err(405, 'Método no permitido.');
    if (req.method === 'POST' && !mismoOrigen(req)) return err(403, 'Origen no permitido.');
    const ok = passwordOk(req, env);
    if (ok === null) return err(503, 'La contraseña de administrador aún no está configurada en Netlify.');
    const k = 'a/' + ipHash(req, ctx, env) + '/' + q15(new Date(now()));
    if (await cuenta(limites, k) >= LIMITES.intentosAdmin) return err(429, 'Demasiados intentos. Espera 15 minutos.');
    if (!ok) { await suma(limites, k); return err(401, 'Contraseña incorrecta.'); }

    if (req.method === 'GET') {
      const claves = []; let cursor;
      do { const r = await store.list({ prefix: 'c/', ...(cursor ? { cursor } : {}) }); (r.blobs || []).forEach(x => claves.push(x.key)); cursor = r.cursor; } while (cursor && claves.length < 2000);
      const items = (await Promise.all(claves.map(async kk => { const v = await store.get(kk, { type: 'json' }); return v ? { ...v, codigo: formatoCodigo(kk.slice(2)) } : null; }))).filter(Boolean)
        .sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
      return out({ ok: true, items });
    }
    let b; try { b = await req.json(); } catch (e) { return err(400, 'Datos no válidos.'); }
    if (b.accion === 'generar') {
      const cant = Math.floor(Number(b.cantidad)); const km = num(b.km), des = num(b.desnivel);
      const ruta = String(b.ruta || '').slice(0, 60).replace(/[^\w-]/g, ''), titulo = String(b.titulo || '').trim().slice(0, 90);
      if (!ruta || !titulo) return err(400, 'Elige una ruta.');
      if (!(cant >= 1 && cant <= LIMITES.maxCodigos)) return err(400, 'La cantidad debe estar entre 1 y ' + LIMITES.maxCodigos + '.');
      if (!fechaOk(String(b.fecha || ''), now())) return err(400, 'La fecha no es válida.');
      if (km === null || des === null) return err(400, 'Faltan los kilómetros o el desnivel de la ruta.');
      const nota = String(b.nota || '').trim().slice(0, 80), creado = new Date(now()).toISOString(), codigos = [];
      for (let i = 0; i < cant; i++) {
        let c, intentos = 0; do { c = nuevoCodigo(); intentos++; } while (intentos < 5 && await store.get('c/' + c, { type: 'json' }));
        await store.setJSON('c/' + c, { ruta, titulo, fecha: b.fecha, km, desnivel: des, nota, creado, canjeado: null, revocado: false });
        codigos.push(formatoCodigo(c));
      }
      return out({ ok: true, codigos });
    }
    const c = normalizaCodigo(b.codigo); const v = c ? await store.get('c/' + c, { type: 'json' }) : null;
    if (!v) return err(404, 'Código no encontrado.');
    if (b.accion === 'revocar') { v.revocado = true; await store.setJSON('c/' + c, v); }
    else if (b.accion === 'restaurar') { v.revocado = false; await store.setJSON('c/' + c, v); }
    else if (b.accion === 'eliminar') await store.delete('c/' + c);
    else return err(400, 'Acción no reconocida.');
    return out({ ok: true });
  } catch (e) { return err(500, 'Error inesperado.'); }
}
