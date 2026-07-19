import { createClient } from '@/lib/supabase/server'
import { fmtMoney } from '@/lib/utils'
import { createClientUser, updateClientPassword, updateClientInfo } from './actions'

export default async function ClientesPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, username, name, contact, rfc')
    .eq('role', 'client')
    .order('name')

  // saldo pendiente por cliente = suma de (total del pedido - pagos del pedido)
  const { data: ordersData } = await supabase.from('orders').select('client_id, total, payments(monto)')

  const saldoPorCliente = new Map<string, number>()
  for (const o of ordersData || []) {
    const paid = (o.payments || []).reduce((s: number, p: any) => s + Number(p.monto), 0)
    const saldo = Number(o.total) - paid
    saldoPorCliente.set(o.client_id, (saldoPorCliente.get(o.client_id) || 0) + saldo)
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
            return (
              <details key={c.id} className="py-3">
                <summary className="cursor-pointer flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <div className="font-mono text-xs text-inksoft">usuario: {c.username} {c.rfc ? `· RFC: ${c.rfc}` : '· sin RFC'}</div>
                    <div className="font-semibold">{c.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {saldo > 0 ? (
                      <span className="font-mono text-sm" style={{ color: '#C2492A' }}>Debe {fmtMoney(saldo)}</span>
                    ) : (
                      <span className="font-mono text-sm text-inksoft">Al corriente</span>
                    )}
                    <span className="text-xs font-mono text-crate underline">editar</span>
                  </div>
                </summary>
                <div className="mt-3 space-y-3">
                  <form action={updateClientInfo} className="field grid grid-cols-3 gap-3 items-end">
                    <input type="hidden" name="clientId" value={c.id} />
                    <div><label>Nombre / razón social</label><input type="text" name="name" defaultValue={c.name} /></div>
                    <div><label>Contacto</label><input type="text" name="contact" defaultValue={c.contact || ''} /></div>
                    <div><label>RFC</label><input type="text" name="rfc" defaultValue={c.rfc || ''} placeholder="ej. XAXX010101000" /></div>
                    <button className="btn small w-fit col-span-3">Guardar datos</button>
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
