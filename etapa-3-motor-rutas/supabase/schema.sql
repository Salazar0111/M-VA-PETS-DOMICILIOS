-- MÜVA PETS — Extensión de esquema para motor de rutas
-- Ejecutar en el SQL Editor de Supabase

alter table citas add column if not exists orden_ruta integer;
alter table citas add column if not exists distancia_km numeric;
alter table citas add column if not exists duracion_min numeric;

-- Tabla de resumen de rutas diarias (una fila por día calculado)
create table if not exists rutas_diarias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  total_km numeric,
  total_duracion_min numeric,
  citas_ids uuid[] not null default '{}',
  calculada_en timestamptz not null default now()
);
