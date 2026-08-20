# MÜVA PETS — Estado del proyecto (traspaso de sesión)

> Generado el 2026-07-25 al cerrar una sesión larga de implementación. Este documento existe para que una sesión nueva de Claude Code tenga contexto completo sin tener que re-descubrir nada ni alucinar detalles. **No contiene secretos** (tokens/keys) — esos ya están configurados en Railway.

---

## 1. Contexto del contrato

- **Contrato:** MKT-CONT-2026-001, firmado 2026-06-28, entre Brayan Salazar Beltrán (marca MARKETEADOS, prestador) y **RCS CAPITAL PARTNERS SAS** (NIT 902.047.679, contratante) para la plataforma **MÜVA PETS**.
- **Qué es:** plataforma de agendamiento de citas veterinarias a domicilio con optimización de rutas y seguimiento del veterinario en campo.
- **Alcance pactado (Cláusula Segunda):** app del veterinario, integración Google Calendar, motor de rutas, urgencias mismo día, WhatsApp+Instagram automatizado, dashboard de cierre, check-in/check-out, notificación de disponibilidad a MÜVA, ventana 8am-4pm.
- Cualquier feature fuera de esa lista requiere otrosí cotizado aparte.
- Detalle completo del contrato: memoria de Claude, archivo `project_muva_pets.md`.

## 2. Arquitectura y URLs

- **Código:** `/Users/brayansalazar/Desktop/Escritorio - MacBook Air de Brayan/MARKETEADOS/CLIENTES/MÜVA PETS/CÓDIGO APP DOMICILIOS`
- **GitHub:** `Salazar0111/M-VA-PETS-DOMICILIOS`, rama `main`. Se hace push directo a main tras cada fix (sin flujo de PR — así ha trabajado esta sesión sin objeción del usuario).
- **Despliegue:** Railway, servicio con **Root Directory = `etapa-1-agente`**. Redespliega automático en cada push.
- **URL de producción:** `https://m-va-pets-domicilios-production.up.railway.app`
- **Base de datos:** Supabase, proyecto `muva-pets`, URL `https://melfivtvbyxejtylnobz.supabase.co`

### URLs públicas (sin login)
| Ruta | Qué es |
|---|---|
| `/maqueta` | Maqueta estática de la app del veterinario — **ya compartida con el cliente, no modificar** |
| `/dashboard` | Maqueta estática del panel MÜVA — **ya compartida con el cliente, no modificar** |
| `/privacy.html` | Política de privacidad, usada para la app de Meta |
| `/health` | Healthcheck |

### URLs de la app real (requieren login)
| Ruta | Qué es | Rol requerido |
|---|---|---|
| `/app/` | PWA del veterinario (instalable) | `veterinario` o `admin` |
| `/panel/` | Panel de operación de MÜVA | `admin` |

## 3. Estado por etapa

| Etapa | Estado |
|---|---|
| 1. Agente de captación (WhatsApp) | ✅ En producción, número real **+57 305 4500349** registrado en Meta |
| 1b. Instagram | ⏳ Código listo (`src/webhooks/instagram.js`), falta conectarlo en Meta for Developers (necesita acceso admin a la cuenta de IG de MÜVA — pendiente del cliente) |
| 2. Supabase + Google Calendar | ✅ Funcionando. Autorizado temporalmente con el Gmail de MÜVA (`resultadosmuva@gmail.com`) mientras llega el correo del veterinario real |
| 3. Motor de rutas | ⚠️ Desbloqueado el 2026-07-25 (`VETERINARIO_DIRECCION_BASE` ya está en Railway), pero **aún no se ha visto correr con datos reales**: el cron nocturno tiene que ejecutarse con citas confirmadas del día siguiente. Verificar en los logs. |
| 4. App del veterinario (PWA) | ✅ En producción en `/app/`, probada end-to-end |
| 5. Panel de operación MÜVA | ✅ En producción en `/panel/`, incluye Informes con filtro de rango y exportación a Excel/CSV |
| 6. Autenticación | ✅ Supabase Auth, login mediado por backend |
| 7. Historial de clientes/mascotas | ✅ Implementado y probado (ver sección 6) |
| 8. Agente conversacional + triaje | ✅ Código listo, **falta correr la migración SQL y desplegar** (ver sección 13) |
| Identidad visual | ✅ Manual de marca recibido y aplicado (ver sección 8) |

## 4. Esquema de Supabase (tabla por tabla)

### `citas`
`id, canal (whatsapp/instagram), contacto_id, nombre_mascota, especie, direccion, tipo_consulta, fecha_hora_solicitada, fecha_hora_confirmada, estado (pendiente/confirmada/completada/cancelada), google_event_id_muva, google_event_id_veterinario, orden_ruta, distancia_km, duracion_min, check_in_at, check_out_at, duracion_real_min, observaciones, metodo_pago (efectivo/transferencia/link_pago), valor_servicio, cliente_id, mascota_id, nombre_dueno, telefono_contacto`

### `perfiles`
`id (=auth.users.id), nombre, rol (veterinario/admin), activo`

### `clientes`
`id, canal, identificador (tel de WhatsApp o ID de Instagram), nombre, telefono, creado_en, actualizado_en` — único por `(canal, identificador)`

### `mascotas`
`id, cliente_id, nombre, especie, creado_en` — único por `(cliente_id, lower(nombre))`. Mismo cliente + mismo nombre de mascota = mismo historial; nombre distinto = registro nuevo.

### `rutas_diarias`
`id, fecha, total_km, total_duracion_min, citas_ids[], calculada_en`

### `notificaciones`
`id, tipo, fecha, mensaje, datos (jsonb), enviada_whatsapp, actualizada_en` — único por `(tipo, fecha)`

## 5. Usuarios de prueba (Supabase Auth)

- **Admin:** `contacto@marketeados.com`
- **Veterinario de prueba:** `vethelps1@gmail.com`

**Cómo generar una sesión de prueba sin contraseña** (útil para probar la API por curl):
```bash
# 1. Generar magic link (usa la secret key de Supabase)
POST {SUPABASE_URL}/auth/v1/admin/generate_link
  body: {"type":"magiclink","email":"<correo>"}
  -> devuelve email_otp

# 2. Canjear el OTP por una sesión real
POST {SUPABASE_URL}/auth/v1/verify
  body: {"type":"magiclink","email":"<correo>","token":"<email_otp>"}
  -> devuelve access_token, usable como "Authorization: Bearer <token>"
```

## 6. Bugs corregidos en la última sesión (no re-diagnosticar)

1. **`fechaISODeMañana()`** calculaba "mañana" con la fecha UTC del servidor en vez de Bogotá — se adelantaba un día completo entre las 7pm y medianoche. *(jobs/calcularRutaDelDia.js)*
2. Menú lateral del panel sin manejadores de clic — corregido, agregada sección "Informes" funcional.
3. "Sin espacio" no distinguía jornada finalizada vs agenda completa — corregido (`motivoSinLibre`).
4. Línea de tiempo de disponibilidad rediseñada (nombre de mascota por bloque, leyenda).
5. `registrarCheckOut` podía guardar duración negativa — clamped a 0.
6. **Las dos apps cerraban sesión ante CUALQUIER error** (no solo 401 real) — un hipo de red te sacaba. Corregido: solo cierra sesión si `err.sesionInvalida === true`.
7. Observaciones, método de pago y valor del servicio ahora obligatorios al cerrar una visita.
8. **BUG CRÍTICO:** el flag `completado` de la máquina de estados (`conversation.js`) se derivaba comparando `sesion.paso === COMPLETADO` DESPUÉS del switch — una vez completada una cita, **cualquier mensaje futuro de ese contacto** (un "gracias") creaba otra cita duplicada, para siempre. Un número de prueba generó 17 duplicados en segundos. Corregido con una bandera local `completadoAhora`.
9. Tras el fix anterior, el primer mensaje de un cliente recurrente se "perdía" (solo reseteaba la sesión, no se clasificaba). Corregido moviendo el reset a los webhooks, antes de la clasificación.
10. **`calcularRangoHorario()`** (ahora reemplazado) usaba `setHours()` en hora del SERVIDOR (UTC en Railway) en vez de Bogotá — "9am" se guardaba como las 4am reales.
11. **BUG CRÍTICO:** `crearEventoVeterinario()` **ignoraba por completo** el texto de fecha/hora que el cliente escribía y el tipo de consulta — SIEMPRE agendaba "mañana 9am" sin importar si decía "urgencia hoy 4pm". Corregido con `src/services/interpretarFecha.js`, un parser de reglas (no LLM) que entiende "hoy", "mañana", días de la semana, horas en 12h/24h, y usa "urgencia" para asumir "hoy" cuando no hay día explícito.

## 7. Pendientes que dependen del cliente

1. ~~**Correo Gmail real del veterinario**~~ → **DESCARTADO 2026-07-25, no volver a pedirlo.** Decisión del usuario: los eventos deben quedar en el Google Calendar de MÜVA (`resultadosmuva@gmail.com`), que es lo que ya pasa. El veterinario no necesita el calendario porque tiene la PWA `/app/` con la ruta del día y el briefing clínico. `GOOGLE_CALENDAR_ID_VETERINARIO` se queda **sin setear** a propósito: así usa `'primary'` del correo autorizado, que es el de MÜVA. El nombre de la variable y de `crearEventoVeterinario()` quedó heredado del diseño original — apuntan al calendario de MÜVA, no al del veterinario.
2. ~~**`VETERINARIO_DIRECCION_BASE`**~~ → **`Calle 142 #19a-27, Bogotá`**, ya configurada en Railway el 2026-07-25. Etapa 3 desbloqueada.
3. **Acceso admin a Instagram de MÜVA** — para conectar el webhook de IG en Meta for Developers (código ya listo).
4. **Confirmación del número de WhatsApp definitivo** — hoy se usa el chip de prueba `+57 305 4500349`; el usuario decidió NO confirmarlo como definitivo hasta terminar todas las pruebas.

## 8. Identidad visual (ya resuelta, no volver a preguntar)

- Manual de marca recibido y decisiones tomadas: **MÜVA como marca madre, SIN la bajada "PET SPA"** (el servicio veterinario es línea distinta al grooming del manual original).
- Tipografías web (el manual usa fuentes de pago sin licencia web): **Fraunces** (display) + **Jost** (UI), autoalojadas como data-URI en `src/public/app/fonts.css` y `src/public/panel/fonts.css`.
- Paleta: `--forest #303926`, `--sage #76836a`, `--terra #be7c60` (color de acción/CTA), `--camel #bb9a7f`, `--cream #e3dacf`.
- Tema claro, fiel al manual.

## 9. Variables de entorno en Railway (nombres, sin valores — ya configuradas)

`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_MAPS_API_KEY`, `INSTAGRAM_PAGE_ACCESS_TOKEN`, `INSTAGRAM_VERIFY_TOKEN`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `WHATSAPP_ACCESS_TOKEN` (permanente), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.

**Faltan (bloquean funcionalidad, ver sección 7):** `VETERINARIO_DIRECCION_BASE`. `GOOGLE_CALENDAR_ID_VETERINARIO` no está seteada pero no es urgente (usa `'primary'` por defecto, que ya apunta a `resultadosmuva@gmail.com`).

## 10. Estructura del código (dentro de `etapa-1-agente/src/`)

```
index.js                    # servidor Express, cron nocturno de rutas
services/
  classifier.js              # Claude Haiku: AGENDAR/FAQ/SPAM
  conversation.js             # máquina de estados del agendamiento por chat
  interpretarFecha.js         # parser de fecha/hora en texto libre (nuevo)
  calendar.js                 # Google Calendar (usa interpretarFecha)
  routes.js                   # geocodificación + Directions API
  supabase.js                 # citas, clientes, mascotas, check-in/out
  operacion.js                # KPIs, disponibilidad, informes, historial
  auth.js                     # login/sesión Supabase
  messenger.js                # envío WhatsApp/Instagram vía Meta
webhooks/
  whatsapp.js, instagram.js
routes/
  veterinario.js, muva.js, auth.js
middleware/
  auth.js                     # requiereSesion, requiereRol
jobs/
  calcularRutaDelDia.js
public/
  app/          # PWA del veterinario (index.html, app.js, styles.css, sw.js)
  panel/        # Panel de MÜVA (index.html, app.js, styles.css)
  maqueta.html, dashboard.html   # maquetas estáticas ya compartidas — NO TOCAR
```

Carpetas `etapa-N-*/` en la raíz del proyecto solo contienen los `schema.sql` de cada migración (histórico), el código real vive todo en `etapa-1-agente/`.

## 11. Cómo limpiar datos de prueba

Todo dato de prueba creado durante desarrollo se identificó con `contacto_id` empezando en `DEMO-`, `TEST-QA-`, o números de teléfono ficticios (57300...), y se borró al terminar cada ronda. Al cierre de esta sesión, la base solo tiene 2 citas reales antiguas (`Kleo`, sin dueño/teléfono, de pruebas muy tempranas) y las citas reales creadas hoy en la prueba con WhatsApp real. Verificar antes de asumir que la base está "limpia".

## 11b. Entregables para el cliente (2026-07-25)

Tres documentos en la raíz del proyecto, todos con la identidad de MÜVA y sin recursos externos:

| Archivo | Para quién |
|---|---|
| `PRESENTACION-ENTREGA-MUVA-PETS.html` | RCS — qué se construyó, recorrido de una cita, estado real de cada módulo del contrato |
| `MANUAL-DE-USO-MUVA-PETS.html` | RCS y el veterinario — accesos, panel, app, asistente, datos, alcance del soporte |
| `TRIAJE-PARA-REVISION-DEL-VETERINARIO.{md,html}` | El veterinario — reglas clínicas a validar. Se **genera** con `node scripts/generar-tabla-triaje.js` |

Publicados en **https://muva-pets-docs.vercel.app** (Vercel, cuenta `salazar0111`, proyecto `muva-pets-docs`). Para actualizar:

```bash
node scripts/generar-tabla-triaje.js    # solo si cambió el triaje
node scripts/construir-sitio-docs.js    # arma muva-pets-docs/
cd ../muva-pets-docs && vercel deploy --prod --yes
```

`construir-sitio-docs.js` existe porque los tres HTML se escribieron como **fragmentos** para el visor de artefactos (empiezan en `<title>`, sin `<!doctype>`, `<head>` ni reset de CSS — eso lo ponía el visor). El script los envuelve en documentos completos, **descarta el `<style>` propio de cada uno** e inyecta el sistema visual compartido de `scripts/sitio/`. Lleva `noindex` y `robots.txt` con `Disallow: /`: el sitio es público por URL pero no aparece en buscadores.

**Diseño (rehecho 2026-07-25):** estética cristal — paneles traslúcidos con `backdrop-filter` sobre lavados de color de la marca — con Fraunces + Jost cargadas de Google Fonts (en Vercel sí se puede; en el visor de artefactos no, por su CSP, y ahí caen al stack de respaldo). El diseño vive en **un solo lugar**: `scripts/sitio/estilo.css` y `scripts/sitio/interaccion.js`. No editar el CSS dentro de los HTML de origen: el constructor lo bota.

**Regla que no se debe romper en `interaccion.js`:** el contenido nunca depende del JavaScript para ser visible. El CSS solo esconde bajo `html.animar`, que agrega el script; hay respaldo de reveal por scroll y un interruptor a los 2,5 s que comprueba la **opacidad pintada** de una pieza ya revelada y, si sigue en 0, quita `animar`. Tampoco se usa `requestAnimationFrame` para nada: se congela en pestañas de fondo y en algunos webviews, y con él se congelaría el texto. Se acelera con temporizadores.

**Dos huecos frente a la Cláusula Segunda detectados al redactarlos** (documentados con honestidad en la presentación, no maquillados):

1. **"Citas urgentes del mismo día con actualización de ruta en tiempo real"** — la urgencia se agenda y aparece de inmediato en la app y el panel, pero el reordenamiento de la ruta **no es automático**: el cron corre a las 8:00 p.m. para el día siguiente y el recálculo del día en curso solo se dispara llamando a mano `GET /rutas/calcular/:fecha` (requiere rol admin). Cerrarlo es pequeño: invocar `calcularRutaDelDia(hoy)` al crear una cita del mismo día.
2. **"Notificación automática a MÜVA cuando el veterinario tenga disponibilidad libre"** — `notificarDisponibilidad()` sí se dispara en cada check-out y escribe en la tabla `notificaciones`, y el panel lo muestra, pero **no envía nada por WhatsApp**. La columna `enviada_whatsapp` existe y nadie la usa. Es notificación *pasiva* (hay que mirar el panel), no *push*.

## 12. Próximo paso

Terminar de desplegar la Etapa 8 (sección 13): correr la migración SQL, setear las variables nuevas en Railway y probar por WhatsApp con el número de prueba.

## 13. Etapa 8 — Agente conversacional y triaje (2026-07-25)

### Qué cambió y por qué

El bot anterior era un **formulario disfrazado de chat**: un clasificador Haiku decidía AGENDAR / FAQ / SPAM y, si pasaba, una máquina de estados de 6 pasos preguntaba nombre → mascota → especie → dirección → tipo → fecha. Dos problemas de fondo:

1. El prompt del clasificador mandaba explícitamente a SPAM todo "saludo sin intención clara" → **quien escribía "hola" o "buenas tardes" no recibía respuesta alguna.** Así arranca la mayoría de la gente.
2. Nunca se preguntaba qué le pasaba al animal. Una urgencia y un corte de uñas seguían exactamente el mismo guion.

Ahora la conversación la conduce un modelo con *tool use*: el clasificador y la máquina de estados **se eliminaron** (`services/classifier.js`, `services/conversation.js`, `prompts/classifier.js`).

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `src/prompts/agente.js` | Personalidad, reglas de estilo, protocolo de urgencias y definición de la herramienta `agendar_cita`. **Bloque estable** — se cachea en la API. |
| `src/services/agente.js` | Loop con Claude: memoria por contacto (12 h, en memoria), tool use, prompt caching, respaldo de modelo. |
| `src/services/triage.js` | Triaje **por reglas, no por LLM**: banderas rojas, nivel de urgencia, muestras que alista el veterinario y preparación previa del dueño. |
| `src/services/atencion.js` | Manejador único de mensajes entrantes: agrupa mensajes seguidos, parte respuestas en varios globos, ejecuta la herramienta. |
| `scripts/probar-triaje.js` | 21 casos del triaje. Corre sin llaves: `node scripts/probar-triaje.js`. |
| `scripts/chat.js` | Chat de prueba por terminal con Supabase/Calendar simulados. Solo necesita `ANTHROPIC_API_KEY`. |

Los webhooks de WhatsApp e Instagram quedaron **delgados**: solo traducen el formato de Meta y llaman a `atencion.js`. La lógica ya no está duplicada.

### Decisiones que no hay que volver a discutir

- **El bot no finge ser humano.** Escribe como persona (mensajes cortos, sin viñetas, sin "soy un asistente virtual"), pero si le preguntan directamente si es un bot, lo dice en una línea y sigue. Afirmar ser humano viola las políticas de Meta y, en un contexto de salud animal, expone a MÜVA.
- **El triaje es por reglas, no por LLM.** Lo que sale de ahí decide si a alguien se le dice "corra a una clínica 24 horas". Una tabla de reglas se audita línea por línea y la puede corregir el veterinario; un modelo puede suavizar una emergencia.
- **El agente no diagnostica ni receta.** Está prohibido en el prompt.
- **Modelo:** `claude-sonnet-5` por defecto (la calidad del texto *es* el producto). Se cambia sin tocar código con `AGENTE_MODELO`.
- **Guardarraíl de horario:** si la hora acordada cae fuera de 8 a.m.–4 p.m. o ya pasó, **no se crea ni la cita ni el evento en Calendar**; se le devuelve el motivo al modelo para que lo negocie con el cliente.

### Emergencias

`triage.js` detecta 10 familias de banderas rojas (dificultad respiratoria, convulsiones, trauma, intoxicación, obstrucción urinaria, torsión gástrica, distocia, golpe de calor, prolapso ocular, sangrado digestivo). Si aparece alguna, se inyecta una alerta en el contexto del turno y el agente **debe** mandar a una clínica 24 horas antes de hablar de agendamiento.

**La tabla de reglas la debe revisar el veterinario antes de salir a producción.** Está escrita con criterio clínico estándar, pero es contenido médico y no lo validó un profesional.

### Columnas nuevas en `citas`

`tipo_servicio`, `motivo_consulta`, `sintomas`, `edad_aproximada`, `nivel_urgencia` (baja/media/alta/critica), `muestras_sugeridas` (text[]), `preparacion_cliente` (text[]).

Migración: `etapa-8-agente-conversacional/supabase/schema.sql`. Es aditiva, no borra nada. `tipo_consulta` se sigue llenando igual para no romper lo existente.

Se ven en la app del veterinario (bloque "Antes de entrar" en el detalle de la visita + marca de prioridad en la lista), en el panel de MÜVA (columna Motivo) y en la descripción del evento de Google Calendar.
