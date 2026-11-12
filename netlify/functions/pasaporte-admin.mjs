/* Pasaporte montañero (zona privada): generar, listar, revocar y eliminar códigos */
import { getStore } from '@netlify/blobs';
import { handleAdmin } from '../lib/pasaporte-core.mjs';

export default (req, context) => handleAdmin(req, context, {
  store: getStore({ name: 'pasaporte', consistency: 'strong' }),
  limites: getStore({ name: 'pasaporte-limites', consistency: 'strong' }),
  env: process.env
});

export const config = { path: '/api/pasaporte-admin' };
