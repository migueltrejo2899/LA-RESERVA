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