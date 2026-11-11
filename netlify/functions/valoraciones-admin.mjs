/* Zona privada: GET /api/valoraciones-admin (lista todo) · POST (ocultar, mostrar, eliminar). Requiere contraseña. */
import { getStore } from '@netlify/blobs';
import { handleAdmin } from '../lib/valoraciones-core.mjs';

export default (req, context) => handleAdmin(req, context, {
  store: getStore({ name: 'valoraciones', consistency: 'strong' }),
  limites: getStore({ name: 'valoraciones-limites', consistency: 'strong' }),
  env: process.env
});

export const config = { path: '/api/valoraciones-admin' };
