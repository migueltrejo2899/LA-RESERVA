'use server'

import { createClient } from '@/lib/supabase/server'
import { usernameToEmail } from '@/lib/utils'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const username = String(formData.get('username') || '').trim()
  const password = String(formData.get('password') || '')

  if (!username || !password) {
    redirect('/login?error=' + encodeURIComponent('Ingresa usuario y contraseña.'))
  }

  const supabase = createClient()

  // El admin usa un username fijo "admin"; los clientes usan el suyo.
  const email = usernameToEmail(username)

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    redirect('/login?error=' + encodeURIComponent('Usuario o contraseña incorrectos.'))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user!.id)
    .single()

  if (profile?.role === 'admin') {
    redirect('/admin/pedidos')
  }
  redirect('/portal')
}
