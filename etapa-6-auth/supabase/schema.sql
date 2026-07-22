-- MÜVA PETS — Perfiles y roles
-- Ejecutar en el SQL Editor de Supabase

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('veterinario', 'admin')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table perfiles enable row level security;

-- Cada usuario solo puede leer su propio perfil desde el cliente.
-- El servidor usa la secret key, que omite RLS.
drop policy if exists "perfil propio" on perfiles;
create policy "perfil propio" on perfiles
  for select using (auth.uid() = id);
