import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from './actions'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/login')

  return (
    <div className="max-w-4xl mx-auto px-5 py-7">
      <div className="flex justify-between items-end border-b-[3px] border-ink pb-4 mb-7 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="brand-mark w-10 h-10 rounded text-base" style={{ transform: 'rotate(-3deg)' }}>R</div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-cratedark">LA RESERVA</h1>
            <div className="font-subtitle text-xs uppercase tracking-widest text-inksoft mt-0.5">Panel administrador</div>
          </div>
        </div>
        <div className="font-mono text-xs bg-offwhite border border-line px-3 py-2 rounded-sm flex items-center gap-3">
          {profile?.name}
          <form action={signOut}><button className="text-stamp underline">salir</button></form>
        </div>
      </div>
      <div className="flex gap-1 mb-5 border-b border-line font-subtitle text-xs uppercase tracking-wide">
        <Link href="/admin" className="px-4 py-2">Resumen</Link>
        <Link href="/admin/pedidos" className="px-4 py-2">Pedidos</Link>
        <Link href="/admin/clientes" className="px-4 py-2">Clientes</Link>
        <Link href="/admin/facturas" className="px-4 py-2">Facturas</Link>
        <Link href="/admin/catalogo" className="px-4 py-2">Catálogo</Link>
      </div>
      {children}
    </div>
  )
}
