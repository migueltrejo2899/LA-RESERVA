import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'
import { createClientUser, updateClientPassword, updateClientInfo } from './actions'
import Link from 'next/link'

export default async function ClientesPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()

  const [{ data: clients }, { data: ordersData }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, name, contact, rfc, dias_credito')
      .eq('role', 'client')
      .order('name'),
    supabase.from('orders').select('id, folio, client_id, total, created_at, payments(monto)'),
  ])

  // saldo pendiente por cliente y lista de sus pedidos con saldo
  const saldoPorCliente = new Map<string, number>()
  const pendientesPorCliente = new Map<string, { id: string; folio: string; created_at: string; saldo: number }[]>()

  for (const o of ordersData || []) {
    const paid = ((o as any).payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
    const saldo = Number(o.total) - paid
    saldoPorCliente.set(o.client_id, (saldoPorCliente.get(o.client_id) || 0) + saldo)
    if (saldo > 0) {
      const lista = pendientesPorCliente.get(o.client_id) || []
      lista.push({ id: o.id, folio: o.folio, created_at: o.created_at, saldo })
      pendientesPorCliente.set(o.client_id, lista)
    }
  }
  for (const lista of pendientesPorCliente.values()) {
    lista.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const totalPorCobrar = Array.from(saldoPorCliente.values()).reduce((s, v) => s + Math.max(0, v), 0)

  return (
    <div className="space-y-5">
      {totalPorCobrar > 0 && (
        <div className="card" style={{ borderColor: '#C2492A' }}>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-display text-lg">Total por cobrar</h3>
            <div className="font-mono font-bold text-lg" style={{ color: '#C2492A' }}>{fmtMoney(totalPorCobrar)}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-display text-lg mb-4">Nuevo cliente</h3>
        <form action={createClientUser} className="field">
          <div className="grid grid-cols-2 gap-4">
            <div><label>Usuario</label><input type="text" name="username" placeholder="ej. tiendaelsol" className="mb-1" />
              <div className="text-xs text-inksoft mb-4">Sin espacios ni acentos (ej. "levi.duran"). Si pones espacios, se ajustan solos.</div>
            </div>
            <div><label>Contraseña</label><input type="text" name="password" placeholder="mínimo 6 caracteres" className="mb-4" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label>Nombre / razón social</label><input type="text" name="name" placeholder="ej. Abarrotes El Sol" className="mb-4" /></div>
            <div><label>Contacto</label><input type="text" name="contact" placeholder="teléfono o correo (opcional)" className="mb-4" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label>RFC (opcional)</label><input type="text" name="rfc" placeholder="ej. XAXX010101000" className="mb-1" />
              <div className="text-xs text-inksoft mb-4">Si lo agregas, sus facturas se archivarán solas al subirlas.</div>
            </div>
            <div><label>Días de crédito</label><input type="number" name="dias_credito" defaultValue={30} min={0} className="mb-1" />
              <div className="text-xs text-inksoft mb-4">Plazo para pagar sus facturas. Pasado este plazo, se marcan como vencidas.</div>
            </div>
          </div>
          {searchParams.error && <div className="text-stamp text-sm font-mono mb-4">{searchParams.error}</div>}
          <button className="btn small">Agregar cliente</button>
        </form>
      </div>

      <div className="card">
        <h3 className="font-display text-lg mb-4">Clientes registrados ({clients?.length || 0})</h3>
        {(!clients || clients.length === 0) && (
          <p className="text-inksoft text-sm">Aún no hay clientes. Agrega el primero arriba.</p>
        )}
        <div className="divide-y divide-line">
          {clients?.map((c) => {
            const saldo = saldoPorCliente.get(c.id) || 0
            const pendientes = pendientesPorCliente.get(c.id) || []
            return (
              <details key={c.id} className="py-3">
                <summary className="cursor-pointer flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <div className="font-mono text-xs text-inksoft">usuario: {c.username} {c.rfc ? `· RFC: ${c.rfc}` : '· sin RFC'} · crédito: {c.dias_credito ?? 30} días</div>
                    <div className="font-semibold">{c.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {saldo > 0 ? (
                      <span className="font-mono text-sm" style={{ color: '#C2492A' }}>
                        Debe {fmtMoney(saldo)} · {pendientes.length} pedido{pendientes.length === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="font-mono text-sm text-inksoft">Al corriente</span>
                    )}
                    <span className="text-xs font-mono text-crate underline">ver / editar</span>
                  </div>
                </summary>
                <div className="mt-3 space-y-3">
                  {pendientes.length > 0 && (
                    <div className="p-3 rounded" style={{ border: '1px solid #C2492A', background: '#FDFBF5' }}>
                      <div className="font-subtitle text-xs uppercase tracking-widest mb-2" style={{ color: '#C2492A' }}>
                        Pedidos por cobrar
                      </div>
                      <div className="divide-y divide-line">
                        {pendientes.map((p) => (
                          <Link key={p.id} href={`/admin/pedidos/${p.id}`} className="flex justify-between items-center py-2 gap-3 hover:bg-crate/5">
                            <span className="font-mono text-xs text-inksoft">{p.folio} · {fmtDate(p.created_at)}</span>
                            <span className="font-mono text-sm font-semibold" style={{ color: '#C2492A' }}>{fmtMoney(p.saldo)}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <form action={updateClientInfo} className="field grid grid-cols-4 gap-3 items-end">
                    <input type="hidden" name="clientId" value={c.id} />
                    <div><label>Usuario</label><input type="text" name="username" defaultValue={c.username} /></div>
                    <div><label>Nombre / razón social</label><input type="text" name="name" defaultValue={c.name} /></div>
                    <div><label>Contacto</label><input type="text" name="contact" defaultValue={c.contact || ''} /></div>
                    <div><label>RFC</label><input type="text" name="rfc" defaultValue={c.rfc || ''} placeholder="ej. XAXX010101000" /></div>
                    <div><label>Días de crédito</label><input type="number" name="dias_credito" defaultValue={c.dias_credito ?? 30} min={0} /></div>
                    <div className="col-span-4 text-xs text-inksoft">
                      Si cambias el usuario, el cliente deberá entrar con el usuario nuevo (su contraseña no cambia).
                    </div>
                    <button className="btn small w-fit col-span-4">Guardar datos</button>
                  </form>
                  <form action={updateClientPassword} className="field flex gap-3 items-end">
                    <input type="hidden" name="clientId" value={c.id} />
                    <div className="flex-1">
                      <label>Nueva contraseña</label>
                      <input type="text" name="newPassword" placeholder="mínimo 6 caracteres" />
                    </div>
                    <button className="btn small">Cambiar contraseña</button>
                  </form>
                </div>
              </details>
            )
          })}
        </div>
      </div>
    </div>
  )
}
