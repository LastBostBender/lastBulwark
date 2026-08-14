// miniapp/src/services/supabase.ts
// Cliente de Supabase para la Mini App

import { createClient } from '@supabase/supabase-js';

// Estas credenciales son públicas (clave anónima) y seguras para usar en el frontend.
// En producción, las moveremos a variables de entorno.
const SUPABASE_URL = 'https://eaimxmiszkgyjarnlebi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6Z6CRpzgkLDhMtm2lslaBw_g19HZdbu';

// Crear y exportar el cliente de Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
