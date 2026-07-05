'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { usernameToEmail } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createClientUser(formData: FormData) {
  const username = String(formData.get('username') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const name = String(formData.get('name') || '').trim()
  const contact = String(formData.get('contact') || '').trim()

  if (!username || !password || !name) {
    redirect('/admin/clientes?error=' + encodeURIComponent('Usuario, contraseña y nombre son obligatorios.'))
  }
  if (password.length < 6) {
    redirect('/admin/clientes?error=' + encodeURIComponent('La contraseña debe tener al menos 6 caracteres.'))
  }

  const admin = createAdminClient()

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  })

  if (authError || !authUser.user) {
    redirect('/admin/clientes?error=' + encodeURIComponent(authError?.message || 'No se pudo crear el usuario (¿el usuario ya existe?).'))
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: authUser.user!.id,
    role: 'client',
    username,
    name,
    contact,
  })

  if (profileError) {
    // revertir el usuario de auth si falla el perfil, para no dejar huérfanos
    await admin.auth.admin.deleteUser(authUser.user!.id)
    redirect('/admin/clientes?error=' + encodeURIComponent(profileError.message))
  }

  revalidatePath('/admin/clientes')
  redirect('/admin/clientes')
}

export async function updateClientPassword(formData: FormData) {
  const clientId = String(formData.get('clientId') || '')
  const newPassword = String(formData.get('newPassword') || '')

  if (newPassword.length < 6) {
    redirect('/admin/clientes?error=' + encodeURIComponent('La nueva contraseña debe tener al menos 6 caracteres.'))
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(clientId, { password: newPassword })
  if (error) {
    redirect('/admin/clientes?error=' + encodeURIComponent(error.message))
  }
  revalidatePath('/admin/clientes')
  redirect('/admin/clientes')
}
