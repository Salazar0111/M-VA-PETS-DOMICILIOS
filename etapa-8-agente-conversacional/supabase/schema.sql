-- MÜVA PETS — Agente conversacional y triaje clínico
-- Ejecutar en el SQL Editor de Supabase.
-- Todo es aditivo: no borra ni renombra nada de lo que ya existe.

-- El agente ahora distingue el tipo de servicio (urgencia, consulta,
-- vacunación...) del motivo en palabras del cliente. `tipo_consulta` se
-- sigue llenando igual para no romper el panel ni la app del veterinario.
alter table citas add column if not exists tipo_servicio text;
alter table citas add column if not exists motivo_consulta text;
alter table citas add column if not exists sintomas text;
alter table citas add column if not exists edad_aproximada text;

-- Triaje calculado por reglas en src/services/triage.js.
-- 'critica' significa que se derivó a una clínica 24 horas: el domicilio no
-- resuelve ese cuadro.
alter table citas add column if not exists nivel_urgencia text
  check (nivel_urgencia in ('baja', 'media', 'alta', 'critica'));

-- Qué debe alistar el veterinario y qué prepara el dueño antes de la visita.
alter table citas add column if not exists muestras_sugeridas text[];
alter table citas add column if not exists preparacion_cliente text[];

-- La jornada se ordena por urgencia en el panel de MÜVA.
create index if not exists idx_citas_urgencia on citas (nivel_urgencia);
