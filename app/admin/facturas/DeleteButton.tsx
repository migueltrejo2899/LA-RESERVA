'use client'

import { useState } from 'react'
import { deleteInvoice } from './actions'

export default function DeleteButton({ invoiceId, filePath, xmlPath }: { invoiceId: string; filePath: string; xmlPath?: string | null }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const fd = new FormData()
    fd.set('invoiceId', invoiceId)
    fd.set('filePath', filePath)
    if (xmlPath) fd.set('xmlPath', xmlPath)
    await deleteInvoice(fd)
    setDeleting(false)
    setConfirming(false)
  }

  if (confirming) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <button className="btn danger small" onClick={handleDelete} disabled={deleting}>
          {deleting ? '…' : 'Sí, eliminar'}
        </button>
        <button className="btn ghost small" onClick={() => setConfirming(false)} disabled={deleting}>
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <button
      className="btn ghost small"
      style={{ color: '#C2492A', borderColor: '#C2492A' }}
      onClick={() => setConfirming(true)}
    >
      Eliminar
    </button>
  )
}
