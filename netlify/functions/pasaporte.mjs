/* Pasaporte montañero: POST /api/pasaporte (canjear un código por un sello) */
import { getStore } from '@netlify/blobs';
import { handleCanje } from '../lib/pasaporte-core.mjs';

export default (req, context) => handleCanje(req, context, {
  store: getStore({ name: 'pasaporte', consistency: 'strong' }),
  limites: getStore({ name: 'pasaporte-limites', consistency: 'strong' }),
  env: process.env
});

export const config = { path: '/api/pasaporte' };
