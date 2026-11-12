/* Semáforo de montaña: GET /api/atlas-tiempo (datos reales de AEMET; necesita la variable AEMET_API_KEY) */
import { getStore } from '@netlify/blobs';
import { handleTiempo } from '../lib/atlas-tiempo-core.mjs';

export default (req, context) => handleTiempo(req, context, {
  store: getStore({ name: 'atlas-tiempo', consistency: 'strong' }),
  env: process.env,
  cargarCfg: async () => {
    const r = await fetch(new URL('/data/atlas.json', req.url), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('No se pudo leer /data/atlas.json');
    return (await r.json()).tiempo || {};
  }
});

export const config = { path: '/api/atlas-tiempo' };
