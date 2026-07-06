-- MÜVA PETS — Extensión de esquema para app del veterinario
-- Ejecutar en el SQL Editor de Supabase

alter table citas add column if not exists check_in_at timestamptz;
alter table citas add column if not exists check_out_at timestamptz;
alter table citas add column if not exists duracion_real_min numeric;
