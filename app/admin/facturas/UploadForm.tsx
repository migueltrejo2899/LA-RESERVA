'use client'

import { useState, useRef } from 'react'
import { bulkUploadInvoices, type UploadResult } from './actions'

export default function UploadForm() {
  const [results, setResults] = useState<UploadResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [fileCount, setFileCount] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    setFileCount(files.length)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const files = fd.getAll('files') as File[]
    if (files.length === 0 || (files.length === 1 && files[0].size === 0)) return

    setUploading(true)
    setResults([])
    try {
      const res = await bulkUploadInvoices(fd)
      setResults(res)
      // limpiar formulario
      form.reset()
      setFileCount(0)
    } catch (err: any) {
      setResults([{ fileName: '(error)', status: 'error', message: err?.message || 'Error inesperado al subir.' }])
    } finally {
      setUploading(false)
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dt = new DataTransfer()
      Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f))
      if (inputRef.current) {
        inputRef.current.files = dt.files
        setFileCount(dt.files.length)
      }
    }
  }

  return (
    <div className="card mb-6">
      <h3 className="font-display text-lg mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        Subir facturas
      </h3>
      <p className="text-sm mb-4" style={{ color: '#5B5C60' }}>
        Arrastra pares de archivos XML + PDF con el mismo nombre base. El sistema lee automáticamente
        el RFC del receptor para asignar cada factura al cliente correcto.
      </p>

      <form ref={formRef} onSubmit={handleSubmit}>
        {/* Drop zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? '#676F36' : '#CBBFA4'}`,
            borderRadius: 4,
            padding: '32px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragActive ? 'rgba(103,111,54,0.06)' : '#EFE6D6',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            name="files"
            accept=".xml,.pdf"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>📄</div>
          {fileCount > 0 ? (
            <p className="text-sm" style={{ color: '#676F36', fontWeight: 600 }}>
              {fileCount} archivo{fileCount !== 1 ? 's' : ''} seleccionado{fileCount !== 1 ? 's' : ''}
            </p>
          ) : (
            <>
              <p className="text-sm" style={{ fontWeight: 500, color: '#2C2D31' }}>
                Arrastra aquí tus archivos XML y PDF
              </p>
              <p className="text-sm" style={{ color: '#5B5C60', marginTop: 4 }}>
                o haz clic para seleccionar
              </p>
            </>
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn" disabled={uploading || fileCount === 0}>
            {uploading ? 'Subiendo…' : 'Subir facturas'}
          </button>
          {fileCount > 0 && !uploading && (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                formRef.current?.reset()
                setFileCount(0)
                setResults([])
              }}
            >
              Limpiar
            </button>
          )}
        </div>
      </form>

      {/* Resultados del upload */}
      {results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h4 className="text-sm" style={{ fontWeight: 600, marginBottom: 8, fontFamily: 'var(--font-subtitle)' }}>
            Resultado de la carga
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '10px 14px',
                  borderRadius: 3,
                  fontSize: 13,
                  border: '1px solid',
                  borderColor: r.status === 'ok' ? '#676F36' : r.status === 'sin_rfc_coincidente' ? '#C2492A' : '#CBBFA4',
                  background: r.status === 'ok' ? 'rgba(103,111,54,0.08)' : r.status === 'sin_rfc_coincidente' ? 'rgba(194,73,42,0.06)' : '#FBF9F3',
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {r.status === 'ok' ? '✓' : r.status === 'sin_rfc_coincidente' ? '⚠' : '✗'}
                </span>
                {' '}
                <span style={{ fontWeight: 500 }}>{r.fileName}</span>
                {r.status === 'ok' && r.clientName && (
                  <span style={{ color: '#676F36' }}> → {r.clientName}</span>
                )}
                {r.message && (
                  <span style={{ color: '#5B5C60' }}> — {r.message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
