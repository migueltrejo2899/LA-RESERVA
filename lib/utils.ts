export function fmtMoney(n: number | null | undefined) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(d: string | Date) {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function statusClass(status: string) {
  const map: Record<string, string> = {
    'Recibido': 'recibido',
    'En preparación': 'preparacion',
    'En camino': 'camino',
    'Entregado': 'entregado',
    'Cancelado': 'cancelado',
  }
  return map[status] || 'recibido'
}

export function paymentStatus(total: number, paid: number) {
  if (paid <= 0) return 'pendiente'
  if (paid < total) return 'parcial'
  return 'pagado'
}

// Supabase Auth requiere un correo. Como el negocio usa "usuario",
// convertimos internamente usuario -> usuario@clientes.portal.local
// El cliente jamás ve ni escribe ese correo, solo su usuario.
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@clientes.portal.local`
}
