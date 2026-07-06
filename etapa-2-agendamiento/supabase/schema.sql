-- MÜVA PETS — Esquema inicial de agendamiento
-- Ejecutar en el SQL Editor de Supabase

create table if not exists citas (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('whatsapp', 'instagram')),
  contacto_id text not null,              -- número de WhatsApp o ID de Instagram
  nombre_mascota text not null,
  especie text not null,
  direccion text not null,
  tipo_consulta text not null,            -- urgencia | programada
  fecha_hora_solicitada text not null,    -- texto libre capturado del usuario
  fecha_hora_confirmada timestamptz,      -- fecha/hora real asignada
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'completada', 'cancelada')),
  google_event_id_muva text,              -- ID del evento en el calendar de MÜVA
  google_event_id_veterinario text,       -- ID del evento en el calendar del veterinario
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_citas_contacto on citas (contacto_id);
create index if not exists idx_citas_estado on citas (estado);

-- Trigger para actualizar "actualizado_en" automáticamente
create or replace function actualizar_timestamp()
returns trigger as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_citas_actualizado on citas;
create trigger trg_citas_actualizado
  before update on citas
  for each row
  execute function actualizar_timestamp();
