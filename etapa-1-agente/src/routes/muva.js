const express = require('express');
const {
  resumenDelDia,
  visitasDeLaSemana,
  informesPeriodo,
  informesRango,
  citasCompletadasEnRango,
  historialCliente,
  ultimaNotificacion,
} = require('../services/operacion');

const router = express.Router();

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOMBRE_METODO_CSV = { efectivo: 'Efectivo', transferencia: 'Transferencia', link_pago: 'Link de pago' };

function celdaCSV(valor) {
  const texto = String(valor ?? '');
  // Cualquier campo con coma, comilla o salto de línea debe ir entre
  // comillas dobles, y las comillas internas se duplican — si no, un
  // valor con coma rompe el conteo de columnas al abrir en Excel.
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

// GET /api/muva/resumen/:fecha — todo lo que pinta el panel de un día
router.get('/resumen/:fecha', async (req, res) => {
  try {
    const [resumen, aviso] = await Promise.all([
      resumenDelDia(req.params.fecha),
      ultimaNotificacion(req.params.fecha),
    ]);
    res.json({ ...resumen, avisoDisponibilidad: aviso });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/semana/:fecha — visitas por día de la semana en curso
router.get('/semana/:fecha', async (req, res) => {
  try {
    res.json({ dias: await visitasDeLaSemana(req.params.fecha) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/informes/:tipo/:fecha — tipo: dia | semana | mes
router.get('/informes/:tipo/:fecha', async (req, res) => {
  if (!['dia', 'semana', 'mes'].includes(req.params.tipo)) {
    return res.status(400).json({ error: 'tipo debe ser dia, semana o mes' });
  }
  try {
    res.json(await informesPeriodo(req.params.tipo, req.params.fecha));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/informes/rango?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — filtro de calendario libre
router.get('/informes/rango', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '')) {
    return res.status(400).json({ error: 'Parámetros desde y hasta requeridos (YYYY-MM-DD)' });
  }
  if (desde > hasta) return res.status(400).json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' });

  try {
    res.json(await informesRango(desde, hasta));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/informes/exportar?desde=&hasta= — descarga en CSV (se abre en Excel)
router.get('/informes/exportar', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '')) {
    return res.status(400).json({ error: 'Parámetros desde y hasta requeridos (YYYY-MM-DD)' });
  }

  try {
    const visitas = await citasCompletadasEnRango(desde, hasta);

    const encabezados = [
      'Fecha', 'Hora', 'Mascota', 'Especie', 'Dueño', 'Teléfono',
      'Motivo', 'Dirección', 'Valor', 'Método de pago', 'Observaciones',
    ];
    const filas = visitas.map((c) => {
      const fecha = c.check_out_at ? new Date(c.check_out_at) : null;
      return [
        fecha ? fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : '',
        fecha ? fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '',
        c.nombre_mascota || '',
        c.especie || '',
        c.nombre_dueno || '',
        c.telefono_contacto || '',
        c.tipo_consulta || '',
        c.direccion || '',
        c.valor_servicio ?? '',
        NOMBRE_METODO_CSV[c.metodo_pago] || '',
        c.observaciones || '',
      ];
    });

    const csv = [encabezados, ...filas].map((fila) => fila.map(celdaCSV).join(',')).join('\r\n');
    const bom = '﻿'; // sin esto, Excel muestra mal las tildes/ñ

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="muva-informe-${desde}-a-${hasta}.csv"`);
    res.send(bom + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/muva/cliente?telefono= — historial de un cliente y sus mascotas
router.get('/cliente', async (req, res) => {
  const { telefono } = req.query;
  if (!telefono) return res.status(400).json({ error: 'Parámetro telefono requerido' });

  try {
    const historial = await historialCliente({ telefono });
    if (!historial) return res.status(404).json({ error: 'No hay antecedentes para este número: es su primera vez.' });
    res.json(historial);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
