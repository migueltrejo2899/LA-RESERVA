'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Menú de pestañas con la pestaña activa resaltada según la página actual.
// Si varias pestañas coinciden (ej. /admin/catalogo y /admin/catalogo/precios),
// se resalta la más específica.
export default function NavTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname() || ''

  const coincide = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const mejor = tabs
    .filter((t) => coincide(t.href))
    .sort((a, b) => b.href.length - a.href.length)[0]

  return (
    <nav className="nav-tabs no-print">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`nav-tab${mejor?.href === t.href ? ' active' : ''}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
