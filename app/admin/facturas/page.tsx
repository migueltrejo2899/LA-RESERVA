import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'
import UploadForm from './UploadForm'
import DeleteButton from './DeleteButton'
import { generarPedidoDesdeFactura, reLigarComplemento } from './actions'

export default async function FacturasAdminPage({
  searchParams,
}: {
  searchParams: { mes?: string; cliente?: string; tipo?: string; error?: string; ok?: string }
}) {
  const supabase = createClient()

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, name, rfc')
    .eq('role', 'client')
    .order('name')

  let query = supabase
    .from('invoices')
    .select('*, profiles!invoices_client_id_fkey(name, rfc)')
    .order('fecha', { ascending: false })

  if (searchParams.cliente) {
    query = query.eq('client_id', searchParams.cliente)
  }
  if (searchParams.tipo && ['factura', 'complemento_pago'].includes(searchParams.tipo)) {
    query = query.eq('tipo', searchParams.tipo)
  }
  if (searchParams.mes) {
    const [y, m] = searchParams.mes.split('-')
    const start = `${y}-${m}-01`
    const endDate = new Date(Number(y), Number(m), 0).getDate()
    const end = `${y}-${m}-${String(endDate).padStart(2, '0')}`
    query = query.gte('fecha', start).lte('fecha', end)
  }

  const { data: invoices } = await query

  const withUrls = await Promise.all(
    (invoices || []).map(async (inv: any) => {
      let pdfUrl: string | undefined
      let xmlUrl: string | undefined
      if (inv.file_path) {
        const { data: signed } = await supabase.storage.from('facturas').createSignedUrl(inv.file_path, 3600)
        pdfUrl = signed?.signedUrl
      }
      if (inv.xml_path && inv.xml_path !== inv.file_path) {
        const { data: signedXml } = await supabase.storage.from('facturas').createSignedUrl(inv.xml_path, 3600)
        xmlUrl = signedXml?.signedUrl
      }
      return { ...inv, pdfUrl, xmlUrl }
    })
  )

  const totalFacturas = withUrls.filter((i) => i.tipo === 'factura').length
  const totalComplementos = withUrls.filter((i) => i.tipo === 'complemento_pago').length
  const montoTotal = withUrls.reduce((s: number, i: any) => s + Number(i.monto || 0), 0)

  const facturas = withUrls.filter((i) => i.tipo === 'factura')
  const sueltos = withUrls.filter(
    (i) => i.tipo === 'complemento_pago' && !facturas.some((f) => f.id === i.factura_id)
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl mb-1">Gestión de facturas</h2>
        <p className="text-sm" style={{ color: '#5B5C60' }}>
          Sube pares de XML + PDF. El sistema los empareja automáticamente por nombre, asigna al cliente por
          RFC, crea el pedido leyendo el XML, y liga cada complemento con su factura y su pedido.
        </p>
      </div>

      {searchParams.error && (
        <div className="card" style={{ borderColor: '#C2492A' }}>
          <p className="text-sm" style={{ color: '#C2492A' }}>{searchParams.error}</p>
        </div>
      )}
      {searchParams.ok && (
        <div className="card" style={{ borderColor: '#676F36' }}>
          <p className="text-sm" style={{ color: '#676F36' }}>{searchParams.ok}</p>
        </div>
      )}

      <UploadForm />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#676F36', fontFamily: 'var(--font-display)' }}>
            {totalFacturas}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Facturas</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#A57F9B', fontFamily: 'var(--font-display)' }}>
            {totalComplementos}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Complementos</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2C2D31', fontFamily: 'var(--font-display)' }}>
            {fmtMoney(montoTotal)}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Monto total</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#626F77', fontFamily: 'var(--font-display)' }}>
            {withUrls.length}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Total archivos</div>
        </div>
      </div>

      <div className="card">
        <form className="field" method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 160 }}>
            <label>Mes</label>
            <input type="month" name="mes" defaultValue={searchParams.mes} />
          </div>
          <div style={{ minWidth: 180 }}>
            <label>Cliente</label>
            <select name="cliente" defaultValue={searchParams.cliente || ''}>
              <option value="">Todos</option>
              {(clients || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} {c.rfc ? `(${c.rfc})` : ''}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <label>Tipo</label>
            <select name="tipo" defaultValue={searchParams.tipo || ''}>
              <option value="">Todos</option>
              <option value="factura">Factura</option>
              <option value="complemento_pago">Complemento de pago</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn small">Filtrar</button>
            <a href="/admin/facturas" className="btn ghost small" style={{ textDecoration: 'none' }}>Limpiar</a>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="font-display" style={{ fontSize: 16, marginBottom: 16 }}>
          Facturas registradas ({withUrls.length})
        </h3>

        {facturas.length === 0 && sueltos.length === 0 ? (
          <p className="text-sm" style={{ color: '#5B5C60' }}>No se encontraron facturas para los filtros seleccionados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {facturas.map((f: any) => {
              const complementos = withUrls.filter((i: any) => i.tipo === 'complemento_pago' && i.factura_id === f.id)
              return (
                <div key={f.id} style={{ border: '1px solid #CBBFA4', borderRadius: 6, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <span className="stamp" style={{ fontSize: 10, padding: '4px 8px', transform: 'none', color: '#676F36' }}>
                        Factura
                      </span>
                      <div style={{ fontWeight: 500, marginTop: 6 }}>{f.profiles?.name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#5B5C60' }}>
                        {fmtDate(f.fecha)}{f.monto ? ` · ${fmtMoney(f.monto)}` : ''}{f.profiles?.rfc ? ` · RFC ${f.profiles.rfc}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {f.order_id ? (
                        <a href={`/admin/pedidos/${f.order_id}`} style={{ fontSize: 12, fontWeight: 600, color: '#676F36', textDecoration: 'underline' }}>
                          Ver pedido
                        </a>
                      ) : (
                        <form action={generarPedidoDesdeFactura}>
                          <input type="hidden" name="invoiceId" value={f.id} />
                          <button
                            type="submit"
                            style={{ fontSize: 11, fontWeight: 600, color: '#C2492A', border: '1px solid #C2492A', borderRadius: 3, padding: '3px 8px', background: 'transparent', cursor: 'pointer' }}
                          >
                            Generar pedido
                          </button>
                        </form>
                      )}
                      {f.pdfUrl && (
                        <a href={f.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#C2492A', textDecoration: 'underline' }}>PDF</a>
                      )}
                      {f.xmlUrl && (
                        <a href={f.xmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#626F77', textDecoration: 'underline' }}>XML</a>
                      )}
                      <DeleteButton invoiceId={f.id} filePath={f.file_path} xmlPath={f.xml_path} />
                    </div>
                  </div>

                  {complementos.length > 0 && (
                    <div style={{ marginTop: 12, paddingLeft: 14, borderLeft: '2px solid #CBBFA4', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                        Complementos de pago
                      </div>
                      {complementos.map((c: any) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <span className="stamp" style={{ fontSize: 10, padding: '4px 8px', transform: 'none', color: '#A57F9B' }}>
                              Complemento
                            </span>
                            <div style={{ fontSize: 12, color: '#5B5C60', marginTop: 4 }}>
                              {fmtDate(c.fecha)}{c.monto ? ` · ${fmtMoney(c.monto)}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {c.pdfUrl && <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#C2492A', textDecoration: 'underline' }}>PDF</a>}
                            {c.xmlUrl && <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#626F77', textDecoration: 'underline' }}>XML</a>}
                            <DeleteButton invoiceId={c.id} filePath={c.file_path} xmlPath={c.xml_path} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {sueltos.length > 0 && (
              <div style={{ border: '1px solid #CBBFA4', borderRadius: 6, padding: 14 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60', marginBottom: 10 }}>
                  Complementos sin factura asociada
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sueltos.map((c: any) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <span className="stamp" style={{ fontSize: 10, padding: '4px 8px', transform: 'none', color: '#A57F9B' }}>
                          Complemento
                        </span>
                        <div style={{ fontWeight: 500, marginTop: 6 }}>{c.profiles?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: '#5B5C60' }}>
                          {fmtDate(c.fecha)}{c.monto ? ` · ${fmtMoney(c.monto)}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {c.order_id ? (
                          <a href={`/admin/pedidos/${c.order_id}`} style={{ fontSize: 12, fontWeight: 600, color: '#676F36', textDecoration: 'underline' }}>Ver pedido</a>
                        ) : (
                          <form action={reLigarComplemento}>
                            <input type="hidden" name="invoiceId" value={c.id} />
                            <button
                              type="submit"
                              style={{ fontSize: 11, fontWeight: 600, color: '#A57F9B', border: '1px solid #A57F9B', borderRadius: 3, padding: '3px 8px', background: 'transparent', cursor: 'pointer' }}
                            >
                              Ligar a pedido
                            </button>
                          </form>
                        )}
                        {c.pdfUrl && <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#C2492A', textDecoration: 'underline' }}>PDF</a>}
                        {c.xmlUrl && <a href={c.xmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#626F77', textDecoration: 'underline' }}>XML</a>}
                        <DeleteButton invoiceId={c.id} filePath={c.file_path} xmlPath={c.xml_path} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
