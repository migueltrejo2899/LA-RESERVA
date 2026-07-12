'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { usernameToEmail } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createClientUser(formData: FormData) {
  const usernameRaw = String(formData.get('username') || '').trim()
  const username = usernameRaw
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
  const password = String(formData.get('password') || '')
  const name = String(formData.get('name') || '').trim()
  const contact = String(formData.get('contact') || '').trim()
  const rfc = String(formData.get('rfc') || '').trim().toUpperCase()

  if (!usernameRaw || !username || !password || !name) {
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
    rfc: rfc || null,
  })

  if (profileError) {
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

export async function updateClientInfo(formData: FormData) {
  const clientId = String(formData.get('clientId') || '')
  const name = String(formData.get('name') || '').trim()
  const contact = String(formData.get('contact') || '').trim()
  const rfc = String(formData.get('rfc') || '').trim().toUpperCase()

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ name, contact, rfc: rfc || null }).eq('id', clientId)
  if (error) {
    redirect('/admin/clientes?error=' + encodeURIComponent(error.message))
  }
  revalidatePath('/admin/clientes')
  redirect('/admin/clientes')
}

export async function deleteClient(formData: FormData) {
  const clientId = String(formData.get('clientId') || '')
  const admin = createAdminClient()

  const { data: archivos } = await admin.storage.from('facturas').list(clientId)
  if (archivos && archivos.length > 0) {
    const paths = archivos.map((a) => `${clientId}/${a.name}`)
    await admin.storage.from('facturas').remove(paths)
  }

  const { error } = await admin.auth.admin.deleteUser(clientId)
  if (error) {
    redirect('/admin/clientes?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/admin/clientes')
  redirect('/admin/clientes')
}
