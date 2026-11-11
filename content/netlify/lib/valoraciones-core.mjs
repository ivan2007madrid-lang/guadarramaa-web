/* Guadarramaa.guidess · lógica de las valoraciones (compartida por las dos funciones).
   No contiene contraseñas: la contraseña de administrador se lee de una variable de entorno de Netlify. */
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

/* ── Ajustes que puedes cambiar ───────────────────────────── */
export const LIMITES = {
  porHora: 3,          // valoraciones por hora y por IP
  porDia: 10,          // valoraciones por día y por IP
  globalDia: 100,      // tope de valoraciones nuevas en toda la web al día (freno contra bots)
  maxNombre: 40,
  maxComentario: 600,
  minSegundos: 3,      // tiempo mínimo desde que se abre la página hasta que se envía
  mostrar: 60,         // cuántas valoraciones recientes se envían a la web (la media usa todas)
  intentosAdmin: 8     // contraseñas erróneas permitidas por IP cada 15 minutos
};

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const out = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_H, ...extra } });
const err = (status, mensaje) => out({ ok: false, mensaje }, status, { 'cache-control': 'no-store' });

const sha = s => createHash('sha256').update(s).digest('hex');
const pad2 = n => String(n).padStart(2, '0');
const claveHora = d => d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + pad2(d.getUTCHours());
const claveDia = d => claveHora(d).slice(0, 8);
const clave15 = d => claveHora(d) + pad2(Math.floor(d.getUTCMinutes() / 15));

function ipHash(req, ctx, env) {
  const ip = (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';
  return sha(ip + '|' + (env.VALORACIONES_SAL || 'guadarramaa')).slice(0, 24);   // no se guarda la IP real
}

/* ── Limpieza y validación ────────────────────────────────── */
const largo = s => Array.from(s).length;
const recorta = (s, n) => Array.from(s).slice(0, n).join('');
function limpia(texto, multilinea) {
  let t = String(texto == null ? '' : texto).normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '');
  if (multilinea) t = t.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  else t = t.replace(/\s+/g, ' ');
  return t.trim();
}
const TIENE_ENLACE = /(https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+)/i;

export function validar(b) {
  if (!b || typeof b !== 'object') return { error: 'Datos no válidos.' };
  const nombre = limpia(b.nombre, false), comentario = limpia(b.comentario, true), est = Number(b.estrellas);
  if (!nombre) return { error: 'Escribe tu nombre.' };
  if (largo(nombre) > LIMITES.maxNombre) return { error: 'El nombre no puede superar ' + LIMITES.maxNombre + ' caracteres.' };
  if (!Number.isInteger(est) || est < 1 || est > 5) return { error: 'Elige una puntuación de 1 a 5 estrellas.' };
  if (!comentario) return { error: 'Escribe tu comentario.' };
  if (largo(comentario) > LIMITES.maxComentario) return { error: 'El comentario no puede superar ' + LIMITES.maxComentario + ' caracteres.' };
  if (TIENE_ENLACE.test(nombre) || TIENE_ENLACE.test(comentario)) return { error: 'Por seguridad no se admiten enlaces ni correos electrónicos.' };
  return { nombre, comentario, estrellas: est };
}

/* ── Almacenamiento: una entrada por valoración ───────────────
   Clave pública:  pub/<fecha invertida>-<estrellas>-<aleatorio>
   Clave oculta:   ocu/<la misma>
   Así la media y el total se calculan solo con la lista de claves (sin leer cada valoración). */
const ID_OK = /^\d{13}-[1-5]-[a-f0-9]{8}$/;
const nuevoId = (ms, est) => String(9999999999999 - ms).padStart(13, '0') + '-' + est + '-' + randomBytes(4).toString('hex');
const idDe = k => k.slice(4);
const estDe = k => Number(k.split('-')[1]);
async function claves(store, prefijo) {
  const { blobs } = await store.list({ prefix: prefijo });
  return blobs.map(b => b.key).sort();   // orden ascendente = más recientes primero
}
const resumen = ks => {
  const total = ks.length, suma = ks.reduce((a, k) => a + estDe(k), 0);
  return { total, media: total ? Math.round(suma / total * 10) / 10 : 0 };
};
const fechaDe = id => new Date(9999999999999 - Number(id.slice(0, 13))).toISOString();

/* ── Límites de envío ─────────────────────────────────────── */
async function cuenta(lim, clave) { const v = await lim.get(clave, { type: 'json' }); return v && v.n ? v.n : 0; }
async function suma(lim, clave) { const n = await cuenta(lim, clave); await lim.setJSON(clave, { n: n + 1 }); return n + 1; }

/* ── API pública: GET lista · POST publica ───────────────── */
export async function handlePublic(req, ctx, deps) {
  const { store, limites, env = {}, now = Date.now } = deps;
  try {
    if (req.method === 'GET') {
      const ks = await claves(store, 'pub/');
      const res = resumen(ks);
      const items = (await Promise.all(ks.slice(0, LIMITES.mostrar).map(async k => {
        const v = await store.get(k, { type: 'json' });
        return v ? { id: idDe(k), nombre: v.nombre, estrellas: v.estrellas, comentario: v.comentario, fecha: v.fecha } : null;
      }))).filter(Boolean);
      return out({ ok: true, ...res, items }, 200, {
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': 'public, s-maxage=15, stale-while-revalidate=30'
      });
    }
    if (req.method !== 'POST') return err(405, 'Método no permitido.');

    /* Comprobaciones antispam */
    const origen = req.headers.get('origin') || req.headers.get('referer') || '';
    try { if (!origen || new URL(origen).host !== new URL(req.url).host) return err(403, 'Origen no permitido.'); } catch (e) { return err(403, 'Origen no permitido.'); }
    if (!(req.headers.get('content-type') || '').includes('application/json')) return err(415, 'Formato no válido.');
    const texto = await req.text();
    if (texto.length > 4000) return err(413, 'Mensaje demasiado largo.');
    let b; try { b = JSON.parse(texto); } catch (e) { return err(400, 'Datos no válidos.'); }

    if (b && typeof b.web === 'string' && b.web.trim() !== '') return out({ ok: true, simulado: true }, 201, { 'cache-control': 'no-store' }); // trampa para bots: se finge éxito
    const t = Number(b && b.t), seg = (now() - t) / 1000;
    if (!Number.isFinite(t) || seg < LIMITES.minSegundos || seg > 60 * 60 * 24) return err(400, 'Espera unos segundos antes de publicar y vuelve a intentarlo.');

    const v = validar(b);
    if (v.error) return err(400, v.error);

    /* Límites por IP y globales */
    const d = new Date(now()), h = ipHash(req, ctx, env);
    const kh = 'h/' + h + '/' + claveHora(d), kd = 'd/' + h + '/' + claveDia(d), kg = 'g/' + claveDia(d);
    if (await cuenta(limites, kg) >= LIMITES.globalDia) return err(429, 'Hoy hemos recibido muchas valoraciones. Inténtalo de nuevo mañana.');
    if (await cuenta(limites, kh) >= LIMITES.porHora) return err(429, 'Has publicado varias valoraciones seguidas. Inténtalo de nuevo dentro de un rato.');
    if (await cuenta(limites, kd) >= LIMITES.porDia) return err(429, 'Has alcanzado el máximo de valoraciones de hoy. Gracias por tu interés.');
    await Promise.all([suma(limites, kh), suma(limites, kd), suma(limites, kg)]);

    const ms = now(), id = nuevoId(ms, v.estrellas), fecha = new Date(ms).toISOString();
    await store.setJSON('pub/' + id, { nombre: v.nombre, estrellas: v.estrellas, comentario: v.comentario, fecha });
    const res = resumen(await claves(store, 'pub/'));
    return out({ ok: true, ...res, item: { id, nombre: v.nombre, estrellas: v.estrellas, comentario: v.comentario, fecha } }, 201, { 'cache-control': 'no-store' });
  } catch (e) {
    console.error('valoraciones:', e && e.message);
    return err(500, 'No se ha podido completar la operación. Inténtalo de nuevo más tarde.');
  }
}

/* ── API privada: GET lista todo · POST ocultar / mostrar / eliminar ── */
function passwordOk(req, env) {
  const esperada = env.VALORACIONES_ADMIN;
  if (!esperada || esperada.length < 8) return null;           // sin contraseña configurada: cerrado
  const dada = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return timingSafeEqual(createHash('sha256').update(dada).digest(), createHash('sha256').update(esperada).digest());
}

export async function handleAdmin(req, ctx, deps) {
  const { store, limites, env = {}, now = Date.now } = deps;
  const noStore = { 'cache-control': 'no-store' };
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return err(405, 'Método no permitido.');
    const origen = req.headers.get('origin');
    if (req.method === 'POST') { try { if (!origen || new URL(origen).host !== new URL(req.url).host) return err(403, 'Origen no permitido.'); } catch (e) { return err(403, 'Origen no permitido.'); } }

    const ok = passwordOk(req, env);
    if (ok === null) return err(503, 'La contraseña de administrador aún no está configurada en Netlify.');
    const k = 'a/' + ipHash(req, ctx, env) + '/' + clave15(new Date(now()));
    if (await cuenta(limites, k) >= LIMITES.intentosAdmin) return err(429, 'Demasiados intentos. Espera 15 minutos.');
    if (!ok) { await suma(limites, k); return err(401, 'Contraseña incorrecta.'); }

    if (req.method === 'GET') {
      const [pub, ocu] = await Promise.all([claves(store, 'pub/'), claves(store, 'ocu/')]);
      const todas = pub.concat(ocu).slice(0, 1000);
      const items = (await Promise.all(todas.map(async kk => {
        const v = await store.get(kk, { type: 'json' });
        return v ? { id: idDe(kk), oculta: kk.startsWith('ocu/'), nombre: v.nombre, estrellas: v.estrellas, comentario: v.comentario, fecha: v.fecha } : null;
      }))).filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));
      /* Limpieza de contadores antiguos (opcional y barata) */
      limpiarContadores(limites, new Date(now())).catch(() => { });
      return out({ ok: true, items, ...resumen(pub) }, 200, noStore);
    }

    let b; try { b = JSON.parse(await req.text()); } catch (e) { return err(400, 'Datos no válidos.'); }
    const id = b && b.id, accion = b && b.accion;
    if (typeof id !== 'string' || !ID_OK.test(id)) return err(400, 'Identificador no válido.');
    if (accion === 'eliminar') { await Promise.all([store.delete('pub/' + id), store.delete('ocu/' + id)]); return out({ ok: true }, 200, noStore); }
    const [desde, hasta] = accion === 'ocultar' ? ['pub/', 'ocu/'] : accion === 'mostrar' ? ['ocu/', 'pub/'] : [];
    if (!desde) return err(400, 'Acción no válida.');
    const v = await store.get(desde + id, { type: 'json' });
    if (!v) return err(404, 'Esa valoración ya no existe o ya estaba en ese estado.');
    await store.setJSON(hasta + id, v);
    await store.delete(desde + id);
    return out({ ok: true }, 200, noStore);
  } catch (e) {
    console.error('valoraciones-admin:', e && e.message);
    return err(500, 'No se ha podido completar la operación.');
  }
}

async function limpiarContadores(lim, d) {
  const hoy = claveDia(d), ayer = claveDia(new Date(d.getTime() - 864e5));
  const { blobs } = await lim.list();
  await Promise.all(blobs.map(b => b.key).filter(k => { const f = k.split('/').pop().slice(0, 8); return f < ayer && f !== hoy; }).slice(0, 200).map(k => lim.delete(k)));
}
