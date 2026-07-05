import type { Metadata } from 'next'
import { Anton, Oswald, Inter, Kaushan_Script, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const display = Anton({ subsets: ['latin'], weight: ['400'], variable: '--font-display' })
const subtitle = Oswald({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-subtitle' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' })
const accent = Kaushan_Script({ subsets: ['latin'], weight: ['400'], variable: '--font-accent' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'La Reserva — Portal de trazabilidad',
  description: 'Trazabilidad de pedidos, pagos y facturas — La Reserva',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${display.variable} ${subtitle.variable} ${body.variable} ${accent.variable} ${mono.variable} font-body`}>
        {children}
      </body>
    </html>
  )
}
