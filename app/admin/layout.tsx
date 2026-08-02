import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from './actions'
import NavTabs from '../NavTabs'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/login')

  return (
    <div className="max-w-4xl mx-auto px-5 py-6">
      <div className="topbar no-print">
        <div className="flex items-center gap-3">
          <div className="brand-mark w-11 h-11 text-lg" style={{ transform: 'rotate(-3deg)' }}>R</div>
          <div>
            <h1 className="font-display text-xl tracking-wide text-cratedark leading-tight">LA RESERVA</h1>
            <div className="font-subtitle text-[10px] uppercase tracking-widest text-inksoft">Panel administrador</div>
          </div>
        </div>
        <div className="font-mono text-xs text-inksoft flex items-center gap-3">
          {profile?.name}
          <form action={signOut}><button className="btn ghost small">Salir</button></form>
        </div>
      </div>

      <NavTabs
        tabs={[
          { href: '/admin', label: 'Resumen' },
          { href: '/admin/pedidos', label: 'Pedidos' },
          { href: '/admin/clientes', label: 'Clientes' },
          { href: '/admin/facturas', label: 'Facturas' },
          { href: '/admin/catalogo', label: 'Catálogo' },
          { href: '/admin/catalogo/precios', label: 'Precios' },
        ]}
      />

      {children}
    </div>
  )
}
