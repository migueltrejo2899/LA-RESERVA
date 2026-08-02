import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NavTabs from '../NavTabs'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, name, username').eq('id', user.id).single()
  if (profile?.role !== 'client') redirect('/login')

  const esPublico = profile?.username?.toLowerCase() === 'publico'

  async function signOut() {
    'use server'
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  const tabs = esPublico
    ? [{ href: '/portal/catalogo', label: 'Catálogo' }]
    : [
        { href: '/portal', label: 'Pedidos' },
        { href: '/portal/facturas', label: 'Facturas' },
        { href: '/portal/catalogo', label: 'Catálogo' },
        { href: '/portal/estado-cuenta', label: 'Estado de cuenta' },
      ]

  return (
    <div className="max-w-3xl mx-auto px-5 py-6">
      <div className="topbar no-print">
        <div className="flex items-center gap-3">
          <div className="brand-mark w-11 h-11 text-lg" style={{ transform: 'rotate(-3deg)' }}>R</div>
          <div>
            <h1 className="font-display text-xl tracking-wide text-cratedark leading-tight">LA RESERVA</h1>
            <div className="font-subtitle text-[10px] uppercase tracking-widest text-inksoft">Hola, {profile?.name}</div>
          </div>
        </div>
        <div className="font-mono text-xs text-inksoft flex items-center gap-3">
          <form action={signOut}><button className="btn ghost small">Salir</button></form>
        </div>
      </div>

      <NavTabs tabs={tabs} />

      {children}
    </div>
  )
}
