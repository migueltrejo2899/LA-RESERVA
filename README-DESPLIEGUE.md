# Guía de despliegue — Portal de trazabilidad

No necesitas saber programar para seguir esta guía, solo ir paso a paso.
Tiempo estimado: 1 a 2 horas la primera vez.

## Parte 1 — Crear la base de datos (Supabase)

1. Entra a **https://supabase.com** y crea una cuenta gratuita.
2. Clic en "New Project". Ponle un nombre (ej. `comercializadora`) y una contraseña
   segura para la base de datos (guárdala, la puedes necesitar después).
3. Espera 2-3 minutos a que el proyecto se cree.
4. En el menú izquierdo, ve a **SQL Editor** → "New query".
5. Abre el archivo `supabase/schema.sql` de este proyecto, copia **todo** su
   contenido, pégalo en el editor y da clic en **Run**. Esto crea todas las
   tablas, los permisos de seguridad y el espacio de almacenamiento de facturas.
6. Ve a **Project Settings** (ícono de engrane) → **API**. Ahí vas a ver 3 datos
   que necesitarás en la Parte 3:
   - `Project URL`
   - `anon public` key
   - `service_role` key (¡esta es secreta, nunca la compartas ni la subas a internet!)

## Parte 2 — Crear tu usuario administrador

Como medida de seguridad, el primer usuario admin se crea a mano:

1. En Supabase, ve a **Authentication** → **Users** → "Add user" → "Create new user".
2. Email: `admin@clientes.portal.local`
3. Password: la que tú quieras usar para entrar como administrador (guárdala).
4. Marca la casilla "Auto Confirm User".
5. Ve a **Table Editor** → tabla `profiles` → "Insert row":
   - `id`: copia el ID del usuario que acabas de crear (está en Authentication > Users)
   - `role`: `admin`
   - `username`: `admin`
   - `name`: tu nombre o el de tu empresa
6. Guarda.

Ya puedes entrar al portal con usuario `admin` y la contraseña que definiste.

## Parte 3 — Publicar el sitio (Vercel)

1. Sube este proyecto a una cuenta de **GitHub** (si no tienes, créala gratis en
   github.com y sube esta carpeta como un nuevo repositorio — GitHub Desktop
   hace esto sin usar comandos).
2. Entra a **https://vercel.com**, crea una cuenta gratuita (puedes usar tu
   cuenta de GitHub para entrar).
3. Clic en "Add New" → "Project" → selecciona el repositorio que subiste.
4. Antes de dar clic en "Deploy", abre la sección **Environment Variables** y
   agrega las 3 que copiaste en la Parte 1:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Clic en **Deploy**. En 2-3 minutos tu sitio estará en línea en una dirección
   tipo `tu-proyecto.vercel.app`.

## Parte 4 — Conectar tu propio dominio

1. En tu proyecto de Vercel, ve a **Settings** → **Domains**.
2. Escribe tu dominio (ej. `portal.tuempresa.com` o `www.tuempresa.com`) y
   agrégalo.
3. Vercel te va a mostrar 1 o 2 registros DNS (tipo `CNAME` o `A`) que debes
   copiar en el panel de administración donde compraste tu dominio (GoDaddy,
   Namecheap, Hostinger, etc. — busca la sección "DNS" o "Zona DNS").
4. Los cambios de DNS pueden tardar entre 10 minutos y unas horas en activarse.

Cuando esto funcione, tu portal ya estará viviendo en tu propio dominio. 🎉

## Y ahora, ¿cómo lo uso día a día?

- Entra a tu dominio, usuario `admin`, con la contraseña que definiste.
- En **Clientes**, da de alta a cada cliente (usuario + contraseña que tú
  eliges para ellos — compártesela por el medio que prefieras).
- En **Pedidos**, registra cada pedido nuevo, actualiza su estatus conforme
  avanza, registra los pagos y sube las facturas/complementos en PDF o XML
  que ya generas en tu sistema de facturación actual.
- Tu cliente entra con su usuario y ve todo: estatus, pagos, y en la pestaña
  **Facturas** puede filtrar por día o mes y descargar sus archivos.

## Costos aproximados

- Supabase: gratis hasta 500MB de base de datos y 1GB de archivos (te alcanza
  de sobra para <20 clientes).
- Vercel: gratis para este tipo de uso.
- Tu dominio: el que ya pagas.
- **Total adicional: $0 pesos/mes**, mientras te mantengas en estos límites.

## Si prefieres no hacer esto tú mismo

Cualquier freelancer con experiencia en Next.js/Vercel puede hacer las Partes
1 a 4 en un par de horas — es trabajo mecánico de configuración, no de
programación (el código ya está listo). Basta con darle esta guía y el
proyecto completo.
