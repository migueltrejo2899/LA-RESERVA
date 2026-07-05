-- ============================================================
-- ESQUEMA: Portal de trazabilidad de pedidos, pagos y facturas
-- Ejecuta este archivo completo en Supabase: SQL Editor > New query
-- ============================================================

-- 1. PERFILES (extiende auth.users con rol, username visible y datos de contacto)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','client')),
  username text unique not null,
  name text not null,
  contact text,
  created_at timestamptz default now()
);

-- 2. PEDIDOS
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  client_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'Recibido' check (status in ('Recibido','En preparación','En camino','Entregado','Cancelado')),
  total numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- 3. ARTÍCULOS DE CADA PEDIDO
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  producto text not null,
  cantidad numeric(12,2) not null,
  precio numeric(12,2) not null
);

-- 4. HISTORIAL DE ESTATUS (trazabilidad)
create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz default now()
);

-- 5. PAGOS
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  monto numeric(12,2) not null,
  fecha date not null default current_date,
  metodo text not null,
  nota text,
  created_at timestamptz default now()
);

-- 6. FACTURAS Y COMPLEMENTOS DE PAGO (archivos ya generados en otro sistema)
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  tipo text not null check (tipo in ('factura','complemento_pago')),
  fecha date not null default current_date,
  monto numeric(12,2),
  file_path text not null,   -- ruta dentro del bucket "facturas"
  file_name text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table payments enable row level security;
alter table invoices enable row level security;

-- Helper: ¿el usuario autenticado es admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- PROFILES: admin ve todo, cliente ve solo su propio perfil
create policy "profiles_select" on profiles for select
  using (is_admin() or id = auth.uid());
create policy "profiles_insert_admin" on profiles for insert
  with check (is_admin());
create policy "profiles_update_admin" on profiles for update
  using (is_admin());

-- ORDERS: admin ve/edita todo, cliente ve solo sus pedidos
create policy "orders_select" on orders for select
  using (is_admin() or client_id = auth.uid());
create policy "orders_insert_admin" on orders for insert
  with check (is_admin());
create policy "orders_update_admin" on orders for update
  using (is_admin());

-- ORDER ITEMS: heredan visibilidad del pedido
create policy "order_items_select" on order_items for select
  using (is_admin() or exists (select 1 from orders o where o.id = order_id and o.client_id = auth.uid()));
create policy "order_items_insert_admin" on order_items for insert
  with check (is_admin());

-- STATUS HISTORY
create policy "status_history_select" on order_status_history for select
  using (is_admin() or exists (select 1 from orders o where o.id = order_id and o.client_id = auth.uid()));
create policy "status_history_insert_admin" on order_status_history for insert
  with check (is_admin());

-- PAYMENTS
create policy "payments_select" on payments for select
  using (is_admin() or exists (select 1 from orders o where o.id = order_id and o.client_id = auth.uid()));
create policy "payments_insert_admin" on payments for insert
  with check (is_admin());

-- INVOICES (facturas y complementos)
create policy "invoices_select" on invoices for select
  using (is_admin() or client_id = auth.uid());
create policy "invoices_insert_admin" on invoices for insert
  with check (is_admin());
create policy "invoices_delete_admin" on invoices for delete
  using (is_admin());

-- ============================================================
-- STORAGE: bucket privado para las facturas
-- ============================================================
insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

-- Solo admin puede subir/borrar; cada cliente solo puede leer archivos
-- guardados bajo su propio folder: facturas/{client_id}/archivo.pdf
create policy "facturas_admin_write" on storage.objects for insert
  with check (bucket_id = 'facturas' and is_admin());
create policy "facturas_admin_delete" on storage.objects for delete
  using (bucket_id = 'facturas' and is_admin());
create policy "facturas_read_own" on storage.objects for select
  using (
    bucket_id = 'facturas'
    and (is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ============================================================
-- Nota: el primer usuario ADMIN se crea manualmente siguiendo
-- README-DESPLIEGUE.md (no se puede insertar por SQL porque
-- auth.users requiere pasar por el sistema de autenticación).
-- ============================================================
