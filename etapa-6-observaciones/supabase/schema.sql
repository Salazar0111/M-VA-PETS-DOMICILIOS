-- MÜVA PETS — Observaciones, pago y valor del servicio
-- Ejecutar en el SQL Editor de Supabase

alter table citas add column if not exists observaciones text;
alter table citas add column if not exists metodo_pago text
  check (metodo_pago in ('efectivo', 'transferencia', 'link_pago'));
alter table citas add column if not exists valor_servicio numeric;
