'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { bulkUploadInvoices, type UploadResult } from './actions'

// misma lógica tolerante que el servidor: sin extensión, sin "(1)",
// sin acentos, sin mayúsculas y sin símbolos
function baseDe(nombre: string) {
  const dot = nombre.lastIndexOf('.')
  const base = dot > -1 ? nombre.slice(0, dot) : nombre
  return base
    .replace(/\s*\(\d+\)\s*$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function extDe(nombre: string) {
  const dot = nombre.lastIndexOf('.')
  return dot > -1 ? nombre.slice(dot + 1).toLowerCase() : ''
}

// agrupa los archivos de una lista en pares XML+PDF por nombre base,
// para que cada par viaje junto en la misma llamada al servidor
function agrupar(files: File[]): File[][] {
  const grupos = new Map<string, File[]>()
  for (const f of files) {
    if (!['pdf', 'xml'].includes(extDe(f.name))) continue
    const base = baseDe(f.name)
    const g = grupos.get(base) || []
    g.push(f)
    grupos.set(base, g)
  }
  return Array.from(grupos.values())
}

export default function UploadForm() {
  const router = useRouter()
  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [resultados, setResultados] = useState<UploadResult[]>([])
  const facturasRef = useRef<HTMLInputElement>(null)
  const complementosRef = useRef<HTMLInputElement>(null)
  const sueltosRef = useRef<HTMLInputElement>(null)

  async function procesar() {
    const facturas = agrupar(Array.from(facturasRef.current?.files || []))
    const sueltos = agrupar(Array.from(sueltosRef.current?.files || []))
    const complementos = agrupar(Array.from(complementosRef.current?.files || []))

    // primero las facturas y al final los complementos, para que cada
    // complemento encuentre su factura ya registrada y se ligue solo
    const grupos = [...facturas, ...sueltos, ...complementos]

    if (grupos.length === 0) {
      setProgreso('Selecciona al menos una carpeta o archivos (PDF/XML).')
      return
    }

    setProcesando(true)
    setResultados([])
    const acumulados: UploadResult[] = []

    for (let i = 0; i < grupos.length; i++) {
      setProgreso(`Procesando documento ${i + 1} de ${grupos.length}…`)
      const fd = new FormData()
      for (const f of grupos[i]) fd.append('files', f)
      try {
        const res = await bulkUploadInvoices(fd)
        acumulados.push(...res)
      } catch {
        acumulados.push({
          fileName: grupos[i][0]?.name || '(desconocido)',
          status: 'error',
          message: 'Falló la subida de este documento (revisa tu conexión o el tamaño del archivo).',
        })
      }
      setResultados([...acumulados])
    }

    const ok = acumulados.filter((r) => r.status === 'ok').length
    setProgreso(`Terminado: ${ok} de ${grupos.length} documento(s) registrados correctamente.`)
    setProcesando(false)
    if (facturasRef.current) facturasRef.current.value = ''
    if (complementosRef.current) complementosRef.current.value = ''
    if (sueltosRef.current) sueltosRef.current.value = ''
    router.refresh()
  }

  return (
    <div className="card">
      <h3 className="font-display text-lg mb-2">Subir facturas y complementos</h3>
      <p className="text-sm text-inksoft mb-4">
        Selecciona la carpeta completa de facturas y la de complementos de pago (con sus XML y PDF).
        Se procesan uno por uno: cada archivo se asigna a su cliente por RFC, se crea el pedido desde
        el XML de la factura, y cada complemento se liga a su factura y registra su pago automáticamente.
      </p>

      <div className="field grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <label>Carpeta de facturas</label>
          <input type="file" multiple ref={facturasRef} {...({ webkitdirectory: '' } as any)} disabled={procesando} />
        </div>
        <div>
          <label>Carpeta de complementos de pago</label>
          <input type="file" multiple ref={complementosRef} {...({ webkitdirectory: '' } as any)} disabled={procesando} />
        </div>
        <div>
          <label>O archivos sueltos (opcional)</label>
          <input type="file" multiple accept=".pdf,.xml" ref={sueltosRef} disabled={procesando} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <button className="btn small" onClick={procesar} disabled={procesando}>
          {procesando ? 'Procesando…' : 'Subir y procesar'}
        </button>
        {progreso && <span className="text-sm font-mono text-inksoft">{progreso}</span>}
      </div>

      {resultados.length > 0 && (
        <div className="mt-4 divide-y divide-line text-sm" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {resultados.map((r, i) => (
            <div key={i} className="py-1.5 flex justify-between gap-3 flex-wrap">
              <span className="font-mono text-xs">{r.fileName}</span>
              {r.status === 'ok' ? (
                <span className="text-xs font-semibold" style={{ color: '#676F36' }}>
                  Registrado{r.clientName ? ` → ${r.clientName}` : ''}
                </span>
              ) : (
                <span className="text-xs" style={{ color: '#C2492A' }}>{r.message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
