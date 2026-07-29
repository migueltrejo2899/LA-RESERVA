
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Genera el enlace de descarga en el momento en que el usuario da clic,
// en lugar de generar enlaces para todos los archivos en cada carga de
// página. Respeta los permisos: cada cliente solo puede descargar los
// archivos de su propia carpeta; el admin puede descargar todos.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')
  if (!path) return new NextResponse('Falta el archivo', { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data, error } = await supabase.storage.from('facturas').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) {
    return new NextResponse('Archivo no disponible', { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
