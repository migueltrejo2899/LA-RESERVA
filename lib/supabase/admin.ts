import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// ADVERTENCIA: este cliente usa la Service Role Key, que se salta
// todas las reglas de seguridad (RLS). Solo se debe importar dentro
// de archivos "actions.ts" marcados con 'use server', nunca en
// componentes de cliente ni exponer la key con NEXT_PUBLIC_.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
