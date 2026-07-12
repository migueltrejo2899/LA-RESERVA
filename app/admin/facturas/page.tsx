import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'
import UploadForm from './UploadForm'
import DeleteButton from './DeleteButton'

export default async function FacturasAdminPage({
  searchParams,
}: {
  searchParams: { mes?: string; cliente?: string; tipo?: string }
}) {
  const supabase = createClient()

  // Traer todos los clientes para el selector de filtro
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, name, rfc')
    .eq('role', 'client')
    .order('name')

  // Query de facturas con filtros opcionales
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

  // Generar URLs firmadas para descarga
  const withUrls = await Promise.all(
    (invoices || []).map(async (inv: any) => {
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
      {/* Encabezado */}
      <div style={{ marginBottom: 24 }}>
        <h2
          className="font-display"
          style={{ fontSize: 22, marginBottom: 4, fontFamily: 'var(--font-display)' }}
        >
          Gestión de facturas
        </h2>
        <p className="text-sm" style={{ color: '#5B5C60' }}>
          Sube pares de XML + PDF. El sistema los empareja automáticamente por nombre y los asigna al
          cliente por RFC.
        </p>
      </div>

      {/* Formulario de subida */}
      <UploadForm />

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
        <div className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#626F77', fontFamily: 'var(--font-display)' }}>
            {withUrls.length}
          </div>
          <div className="text-sm" style={{ color: '#5B5C60', marginTop: 2 }}>Total archivos</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 24 }}>
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
                <option key={c.id} value={c.id}>
                  {c.name} {c.rfc ? `(${c.rfc})` : ''}
                </option>
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
            <a href="/admin/facturas" className="btn ghost small" style={{ textDecoration: 'none' }}>
              Limpiar
            </a>
          </div>
        </form>
      </div>

      {/* Tabla de facturas */}
      <div className="card">
        <h3
          className="font-display"
          style={{ fontSize: 16, marginBottom: 16, fontFamily: 'var(--font-display)' }}
        >
          Facturas registradas ({withUrls.length})
        </h3>

        {withUrls.length === 0 ? (
          <p className="text-sm" style={{ color: '#5B5C60' }}>
            No se encontraron facturas para los filtros seleccionados.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #CBBFA4' }}>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                    Fecha
                  </th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                    Cliente
                  </th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                    Tipo
                  </th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                    Monto
                  </th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                    Folio fiscal
                  </th>
                  <th style={{ padding: '10px 8px', fontFamily: 'var(--font-subtitle)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#5B5C60' }}>
                    Archivos
                  </th>
                  <th style={{ padding: '10px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {withUrls.map((inv: any) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #CBBFA4' }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      {fmtDate(inv.fecha)}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 500 }}>{inv.profiles?.name || '—'}</div>
                      {inv.profiles?.rfc && (
                        <div style={{ fontSize: 11, color: '#5B5C60' }}>{inv.profiles.rfc}</div>
                      )}
                    </td>
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
                      <div style={{ display: 'flex', gap: 8 }}>
                        {inv.pdfUrl && (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#C2492A',
                              textDecoration: 'underline',
                            }}
                          >
                            PDF
                          </a>
                        )}
                        {inv.xmlUrl && (
                          <a
                            href={inv.xmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#626F77',
                              textDecoration: 'underline',
                            }}
                          >
                            XML
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <DeleteButton
                        invoiceId={inv.id}
                        filePath={inv.file_path}
                        xmlPath={inv.xml_path}
                      />
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
