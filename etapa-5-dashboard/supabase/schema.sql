-- MÜVA PETS — Notificaciones de disponibilidad a MÜVA
-- Ejecutar en el SQL Editor de Supabase

create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                 -- 'disponibilidad'
  fecha date not null,
  mensaje text not null,
  datos jsonb,
  enviada_whatsapp boolean not null default false,
  actualizada_en timestamptz not null default now(),
  unique (tipo, fecha)
);

create index if not exists idx_notificaciones_fecha on notificaciones (fecha desc);
