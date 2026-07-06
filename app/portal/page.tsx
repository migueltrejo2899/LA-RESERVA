import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtMoney } from '@/lib/utils'

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

      {withUrls.length === 0 && <p className="text-inksoft text-sm">No hay archivos para el filtro seleccionado.</p>}

      <div className="divide-y divide-line">
        {withUrls.map((inv) => (
          <div key={inv.id} className="flex justify-between items-center py-3 flex-wrap gap-2">
            <div>
              <span className={`stamp ${inv.tipo === 'factura' ? 'entregado' : 'preparacion'}`}>
                {inv.tipo === 'factura' ? 'Factura' : 'Complemento de pago'}
              </span>
              <div className="text-sm mt-1">{inv.file_name} · {fmtDate(inv.fecha)}{inv.monto ? ` · ${fmtMoney(inv.monto)}` : ''}</div>
            </div>
            <div className="flex gap-2">
              {inv.url && (
                <a href={inv.url} target="_blank" rel="noopener noreferrer" className="btn small">Descargar</a>
              )}
              {inv.xmlUrl && inv.xml_path !== inv.file_path && (
                <a href={inv.xmlUrl} target="_blank" rel="noopener noreferrer" className="btn ghost small">XML</a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}