/* Valoraciones públicas: GET /api/valoraciones (lista) · POST /api/valoraciones (publicar) */
import { getStore } from '@netlify/blobs';
import { handlePublic } from '../lib/valoraciones-core.mjs';

export default (req, context) => handlePublic(req, context, {
  store: getStore({ name: 'valoraciones', consistency: 'strong' }),
  limites: getStore({ name: 'valoraciones-limites', consistency: 'strong' }),
  env: process.env
});

export const config = { path: '/api/valoraciones' };
