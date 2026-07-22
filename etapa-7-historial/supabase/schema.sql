-- MÜVA PETS — Historial de clientes y mascotas
-- Ejecutar en el SQL Editor de Supabase

-- Un cliente se identifica por canal + identificador (el número de
-- WhatsApp o el ID de Instagram). Es la única forma confiable de saber
-- si es la misma persona que escribe de nuevo.
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('whatsapp', 'instagram')),
  identificador text not null,
  nombre text not null,
  telefono text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (canal, identificador)
);

-- Una mascota pertenece a un cliente. Si el mismo cliente trae una
-- mascota con nombre distinto, es un registro nuevo (la "salvedad" de
-- que no es el mismo paciente); si trae la misma, se reutiliza y así
-- se acumula su historial de visitas.
create table if not exists mascotas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nombre text not null,
  especie text,
  creado_en timestamptz not null default now()
);

create unique index if not exists mascotas_cliente_nombre_uk
  on mascotas (cliente_id, lower(nombre));

alter table citas add column if not exists cliente_id uuid references clientes(id);
alter table citas add column if not exists mascota_id uuid references mascotas(id);
alter table citas add column if not exists nombre_dueno text;
alter table citas add column if not exists telefono_contacto text;

create index if not exists idx_citas_cliente on citas (cliente_id);
create index if not exists idx_citas_mascota on citas (mascota_id);
