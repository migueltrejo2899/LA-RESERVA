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

  const { data: invoices } = await query

  // generar URLs firmadas (válidas 1 hora) para cada archivo (PDF y XML si existe)
  const withUrls = await Promise.all(
    (invoices || []).map(async (inv) => {
      const { data: signed } = await supabase.storage.from('facturas').createSignedUrl(inv.file_path, 3600)
      let xmlUrl: string | undefined
      if (inv.xml_path) {
        const { data: signedXml } = await supabase.storage.from('facturas').createSignedUrl(inv.xml_path, 3600)
        xmlUrl = signedXml?.signedUrl
      }
      return { ...inv, url: signed?.signedUrl, xmlUrl }
    })
  )

  const facturas = withUrls.filter((i) => i.tipo === 'factura')
  const sinFactura = withUrls.filter(
    (i) => i.tipo === 'complemento_pago' && !facturas.some((f) => f.id === i.factura_id)
  )

  return (
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
          const complementos = withUrls.filter(
            (i) => i.tipo === 'complemento_pago' && i.factura_id === f.id
          )
          return (
            <div key={f.id} className="border border-line rounded p-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <span className="stamp entregado">Factura</span>
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
                  {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>}
                  {f.xmlUrl && f.xml_path !== f.file_path && (
                    <a href={f.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
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
                        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>}
                        {c.xmlUrl && c.xml_path !== c.file_path && (
                          <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
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
                  {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>}
                  {c.xmlUrl && c.xml_path !== c.file_path && (
                    <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
