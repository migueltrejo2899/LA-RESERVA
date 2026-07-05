import { createClient } from '@/lib/supabase/server'
import { createClientUser, updateClientPassword } from './actions'

export default async function ClientesPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, username, name, contact')
    .eq('role', 'client')
    .order('name')

  return (
    <div className="space-y-5">
      <div className="card">
        <h3 className="font-display text-lg mb-4">Nuevo cliente</h3>
        <form action={createClientUser} className="field">
          <div className="grid grid-cols-2 gap-4">
            <div><label>Usuario</label><input type="text" name="username" placeholder="ej. tiendaelsol" className="mb-4" /></div>
            <div><label>Contraseña</label><input type="text" name="password" placeholder="mínimo 6 caracteres" className="mb-4" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label>Nombre / razón social</label><input type="text" name="name" placeholder="ej. Abarrotes El Sol" className="mb-4" /></div>
            <div><label>Contacto</label><input type="text" name="contact" placeholder="teléfono o correo (opcional)" className="mb-4" /></div>
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
          {clients?.map((c) => (
            <details key={c.id} className="py-3">
              <summary className="cursor-pointer flex justify-between items-center">
                <div>
                  <div className="font-mono text-xs text-inksoft">usuario: {c.username}</div>
                  <div className="font-semibold">{c.name}</div>
                </div>
                <span className="text-xs font-mono text-crate underline">cambiar contraseña</span>
              </summary>
              <form action={updateClientPassword} className="field mt-3 flex gap-3 items-end">
                <input type="hidden" name="clientId" value={c.id} />
                <div className="flex-1">
                  <label>Nueva contraseña</label>
                  <input type="text" name="newPassword" placeholder="mínimo 6 caracteres" />
                </div>
                <button className="btn small">Guardar</button>
              </form>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
