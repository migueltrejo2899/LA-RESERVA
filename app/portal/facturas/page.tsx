import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'

export default async function FacturasPage({ searchParams }: { searchParams: { mes?: string; dia?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('client_id', user!.id)
    .order('fecha', { ascending: false })

  // generar URLs firmadas (validas 1 hora) para cada archivo (PDF y XML si existe)
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

  const facturas = withUrls.filter((inv) => inv.tipo === 'factura')
  const complementos = withUrls.filter((inv) => inv.tipo !== 'factura')

  // agrupar cada factura con sus complementos ligados (factura_id)
  let grupos = facturas.map((f) => ({
    factura: f,
    complementos: complementos.filter((c) => c.factura_id === f.id),
  }))

  // complementos que no quedaron ligados a ninguna factura (datos viejos o sin ligar)
  const sinLigar = complementos.filter((c) => !c.factura_id || !facturas.some((f) => f.id === c.factura_id))

  // el filtro de mes/dia se aplica sobre la fecha de la factura de cada grupo
  if (searchParams.dia) {
    grupos = grupos.filter((g) => g.factura.fecha === searchParams.dia)
  } else if (searchParams.mes) {
    grupos = grupos.filter((g) => g.factura.fecha?.slice(0, 7) === searchParams.mes)
  }

  return (
    <div className="card">
      <h3 className="font-display text-lg mb-4">Tus facturas y complementos de pago</h3>

      <form className="field flex flex-wrap gap-4 items-end mb-5" method="get">
        <div>
          <label>Filtrar por mes</label>
          <input type="month" name="mes" defaultValue={searchParams.mes} />
        </div>
        <div>
          <label>Filtrar por dia</label>
          <input type="date" name="dia" defaultValue={searchParams.dia} />
        </div>
        <button type="submit" className="btn">Filtrar</button>
      </form>

      {grupos.length === 0 && sinLigar.length === 0 ? (
        <p className="text-sm text-inksoft">No se encontraron facturas para este periodo.</p>
      ) : (
        <div className="divide-y divide-line">
          {grupos.map(({ factura, complementos }) => (
            <div key={factura.id} className="py-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <span className="stamp entregado">Factura</span>
                  <div className="text-sm mt-1">
                    {fmtDate(factura.fecha)} {factura.monto ? `· ${fmtMoney(factura.monto)}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  {factura.url && (
                    <a href={factura.url} target="_blank" rel="noopener noreferrer" className="btn small">
                      Descargar PDF
                    </a>
                  )}
                  {factura.xmlUrl && (
                    <a href={factura.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn small ghost">
                      Descargar XML
                    </a>
                  )}
                </div>
              </div>

              {complementos.length > 0 && (
                <div className="mt-3 pl-4 border-l-2 border-line space-y-3">
                  {complementos.map((c) => (
                    <div key={c.id} className="flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <span className="stamp preparacion">Complemento de pago</span>
                        <div className="text-sm mt-1">
                          {fmtDate(c.fecha)} {c.monto ? `· ${fmtMoney(c.monto)}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn small ghost">
                            Descargar PDF
                          </a>
                        )}
                        {c.xmlUrl && (
                          <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn small ghost">
                            Descargar XML
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {sinLigar.length > 0 && (
            <div className="py-4">
              <div className="text-xs font-mono uppercase text-inksoft mb-2">Complementos sin factura asociada</div>
              <div className="space-y-3">
                {sinLigar.map((c) => (
                  <div key={c.id} className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <span className="stamp preparacion">Complemento de pago</span>
                      <div className="text-sm mt-1">
                        {fmtDate(c.fecha)} {c.monto ? `· ${fmtMoney(c.monto)}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn small ghost">
                          Descargar PDF
                        </a>
                      )}
                      {c.xmlUrl && (
                        <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn small ghost">
                          Descargar XML
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
