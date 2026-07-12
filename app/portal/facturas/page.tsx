import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'

export default async function FacturasPortalPage({ searchParams }: { searchParams: { mes?: string; dia?: string } }) {
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

  // generar URLs firmadas (validas 1 hora) para cada archivo (PDF y XML si existe)
  const withUrls = await Promise.all(
    (invoices || []).map(async (inv) => {
      let pdfUrl: string | undefined
      let xmlUrl: string | undefined

      if (inv.file_path) {
        const { data: signed } = await supabase.storage
          .from('facturas')
          .createSignedUrl(inv.file_path, 3600)
        pdfUrl = signed?.signedUrl
      }

      if (inv.xml_path && inv.xml_path !== inv.file_path) {
        const { data: signedXml } = await supabase.storage
          .from('facturas')
          .createSignedUrl(inv.xml_path, 3600)
        xmlUrl = signedXml?.signedUrl
      }

      return { ...inv, pdfUrl, xmlUrl }
    })
  )

  // Estadísticas rápidas
  const totalFacturas = withUrls.filter((i) => i.tipo === 'factura').length
  const totalComplementos = withUrls.filter((i) => i.tipo === 'complemento_pago').length
  const montoTotal = withUrls.reduce((s: number, i: any) => s + Number(i.monto || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2
          className="font-display"
          style={{ fontSize: 22, marginBottom: 4, fontFamily: 'var(--font-display)' }}
        >
          Mis facturas y complementos
        </h2>
        <p className="text-sm" style={{ color: '#5B5C60' }}>
          Consulta y descarga tus facturas y complementos de pago.
        </p>
      </div>

      {/* Estadísticas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
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
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <form className="field" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }} method="get">
          <div style={{ minWidth: 160 }}>
            <label>Filtrar por mes</label>
            <input type="month" name="mes" defaultValue={searchParams.mes} />
          </div>
          <div style={{ minWidth: 160 }}>
            <label>Filtrar por día</label>
            <input type="date" name="dia" defaultValue={searchParams.dia} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn small">Filtrar</button>
            <a href="/portal/facturas" className="btn ghost small" style={{ textDecoration: 'none' }}>
              Limpiar
            </a>
          </div>
        </form>
      </div>

      <div className="card">
        {withUrls.length === 0 ? (
          <p className="text-sm" style={{ color: '#5B5C60' }}>
            No se encontraron facturas para los filtros seleccionados.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #CBBFA4' }}>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>Fecha</th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>Tipo</th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>Monto</th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>Folio fiscal</th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>Archivos</th>
                </tr>
              </thead>
              <tbody>
                {withUrls.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #CBBFA4' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtDate(inv.fecha)}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        className="stamp"
                        style={{
                          fontSize: 10,
                          padding: '4px 8px',
                          transform: 'none',
                          color: inv.tipo === 'factura' ? '#676F36' : '#A57F9B',
                        }}
                      >
                        {inv.tipo === 'factura' ? 'Factura' : 'Complemento'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {inv.monto ? fmtMoney(inv.monto) : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#626F77' }}>
                      {inv.folio_fiscal ? inv.folio_fiscal.slice(0, 8) + '…' : '—'}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        {inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#C2492A', textDecoration: 'underline' }}>
                            PDF
                          </a>
                        )}
                        {inv.xmlUrl && (
                          <a href={inv.xmlUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#626F77', textDecoration: 'underline' }}>
                            XML
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
