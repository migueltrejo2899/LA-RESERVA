import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'
import Link from 'next/link'

export default async function FacturasPage({ searchParams }: { searchParams: { mes?: string; dia?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let query = supabase.from('invoices').select('*').eq('client_id', user!.id).order('fecha', { ascending: false })

  if (searchParams.dia) {
    query = query.eq('fecha', searchParams.dia)
  } else if (searchParams.mes) {
    const [y, m] = searchParams.mes.split('-')
    const start = `${y}-${m}-01`
    const endDate = new Date(Number(y), Number(m), 0).getDate()
    const end = `${y}-${m}-${String(endDate).padStart(2, '0')}`
    query = query.gte('fecha', start).lte('fecha', end)
  }

  // las dos consultas corren en paralelo
  const [{ data: profile }, { data: invoices }] = await Promise.all([
    supabase.from('profiles').select('dias_credito').eq('id', user!.id).single(),
    query,
  ])

  const lista = invoices || []
  const diasCredito = profile?.dias_credito ?? 30

  const facturas = lista.filter((i) => i.tipo === 'factura')
  const sinFactura = lista.filter(
    (i) => i.tipo === 'complemento_pago' && !facturas.some((f) => f.id === i.factura_id)
  )

  // una factura se considera pendiente de pago cuando no tiene ningún
  // complemento de pago ligado a ella; y vencida cuando además ya pasaron
  // los días de crédito desde su fecha
  const hoy = new Date()
  function sinComplemento(f: any) {
    return !lista.some((i) => i.tipo === 'complemento_pago' && i.factura_id === f.id)
  }
  function estaVencida(f: any) {
    if (!sinComplemento(f)) return false
    const limite = new Date(f.fecha)
    limite.setDate(limite.getDate() + diasCredito)
    return hoy > limite
  }

  const facturasPendientes = facturas.filter(sinComplemento)
  const totalAdeudado = facturasPendientes.reduce((s, f) => s + Number(f.monto || 0), 0)
  const facturasVencidas = facturas.filter(estaVencida)
  const totalVencido = facturasVencidas.reduce((s, f) => s + Number(f.monto || 0), 0)

  const dl = (path: string) => `/descargar?path=${encodeURIComponent(path)}`

  return (
    <div className="space-y-5">
      {facturas.length > 0 && (
        <div className="card" style={{ borderColor: facturasVencidas.length > 0 ? '#C2492A' : undefined }}>
          <h3 className="font-display text-lg mb-2">Facturas pendientes de pago</h3>
          {facturasPendientes.length === 0 ? (
            <p className="text-sm text-inksoft">Todas tus facturas ya tienen su complemento de pago registrado.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <p className="text-sm text-inksoft">
                  {facturasPendientes.length} factura{facturasPendientes.length === 1 ? '' : 's'} sin complemento de pago
                </p>
                <div className="font-mono font-bold text-lg" style={{ color: '#C2492A' }}>
                  {fmtMoney(totalAdeudado)}
                </div>
              </div>
              {facturasVencidas.length > 0 && (
                <div className="flex justify-between items-center flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid #CBBFA4' }}>
                  <p className="text-sm font-semibold" style={{ color: '#C2492A' }}>
                    {facturasVencidas.length} ya vencida{facturasVencidas.length === 1 ? '' : 's'} (más de {diasCredito} días)
                  </p>
                  <div className="font-mono font-bold" style={{ color: '#C2492A' }}>
                    {fmtMoney(totalVencido)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 className="font-display text-lg mb-4">Tus facturas y complementos de pago</h3>

        <form className="field flex flex-wrap gap-4 items-end mb-5" method="get">
          <div>
            <label>Filtrar por mes</label>
            <input type="month" name="mes" defaultValue={searchParams.mes} />
          </div>
          <div>
            <label>Filtrar por día</label>
            <input type="date" name="dia" defaultValue={searchParams.dia} />
          </div>
          <button className="btn small">Filtrar</button>
          <a href="/portal/facturas" className="text-sm font-mono text-crate underline mb-1">limpiar</a>
        </form>

        {facturas.length === 0 && sinFactura.length === 0 && (
          <p className="text-inksoft text-sm">No hay archivos para el filtro seleccionado.</p>
        )}

        <div className="space-y-4">
          {facturas.map((f) => {
            const complementos = lista.filter(
              (i) => i.tipo === 'complemento_pago' && i.factura_id === f.id
            )
            const pendiente = complementos.length === 0
            const vencida = estaVencida(f)
            return (
              <div key={f.id} className="border rounded p-3" style={{ borderColor: vencida ? '#C2492A' : '#CBBFA4' }}>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <span className="stamp entregado">Factura</span>
                    {vencida ? (
                      <span className="stamp" style={{ marginLeft: 6, color: '#C2492A', borderColor: '#C2492A' }}>
                        Vencida
                      </span>
                    ) : pendiente ? (
                      <span className="stamp" style={{ marginLeft: 6, color: '#C2492A', borderColor: '#C2492A' }}>
                        Pendiente de pago
                      </span>
                    ) : null}
                    <div className="text-sm mt-1">
                      {f.file_name} · {fmtDate(f.fecha)}{f.monto ? ` · ${fmtMoney(f.monto)}` : ''}
                    </div>
                    {f.order_id && (
                      <Link href={`/portal/pedidos/${f.order_id}`} className="text-xs font-mono text-crate underline">
                        Ver pedido relacionado
                      </Link>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {f.file_path && <a href={dl(f.file_path)} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>}
                    {f.xml_path && f.xml_path !== f.file_path && (
                      <a href={dl(f.xml_path)} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
                    )}
                  </div>
                </div>

                {complementos.length > 0 && (
                  <div className="mt-3 pl-4 border-l-2 border-line space-y-3">
                    <div className="text-xs font-mono uppercase text-inksoft">Complementos de pago</div>
                    {complementos.map((c) => (
                      <div key={c.id} className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                          <span className="stamp preparacion">Complemento</span>
                          <div className="text-sm mt-1">
                            {c.file_name} · {fmtDate(c.fecha)}{c.monto ? ` · ${fmtMoney(c.monto)}` : ''}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {c.file_path && <a href={dl(c.file_path)} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>}
                          {c.xml_path && c.xml_path !== c.file_path && (
                            <a href={dl(c.xml_path)} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {sinFactura.length > 0 && (
            <div className="border border-line rounded p-3">
              <div className="text-xs font-mono uppercase text-inksoft mb-2">Complementos sin factura asociada</div>
              {sinFactura.map((c) => (
                <div key={c.id} className="flex justify-between items-center flex-wrap gap-2 py-2">
                  <div>
                    <span className="stamp preparacion">Complemento</span>
                    <div className="text-sm mt-1">
                      {c.file_name} · {fmtDate(c.fecha)}{c.monto ? ` · ${fmtMoney(c.monto)}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {c.file_path && <a href={dl(c.file_path)} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>}
                    {c.xml_path && c.xml_path !== c.file_path && (
                      <a href={dl(c.xml_path)} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
