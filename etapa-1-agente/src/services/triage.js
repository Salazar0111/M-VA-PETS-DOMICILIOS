// Triaje veterinario por reglas, NO por LLM.
//
// Por qué reglas: lo que sale de aquí decide si a un cliente se le dice
// "corre a una clínica 24 horas" y qué material carga el veterinario en el
// maletín. Un modelo de lenguaje puede inventar un examen o suavizar una
// emergencia; una tabla de reglas siempre hace lo mismo, se puede auditar
// línea por línea y la puede corregir un veterinario sin tocar prompts.
//
// El agente conversacional extrae los síntomas en texto libre; este módulo
// los clasifica. Nada de esto es un diagnóstico: es preparación logística
// (qué alistar, qué tan rápido) más una red de seguridad para no dejar
// pasar una urgencia real.

const NIVELES = ['baja', 'media', 'alta', 'critica'];

function pesoNivel(nivel) {
  return NIVELES.indexOf(nivel);
}

function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ---------------------------------------------------------------------------
// Banderas rojas: cuadros que un domicilio NO resuelve y que pierden vidas
// por cada hora de espera. Si alguna aparece, el nivel salta a 'critica' y
// el agente debe decirle al cliente que vaya YA a una clínica 24 horas.
// ---------------------------------------------------------------------------

const BANDERAS_ROJAS = [
  {
    clave: 'dificultad_respiratoria',
    patron: /no puede respirar|dificultad (para )?respirar|le cuesta respirar|se ahoga|ahogand|respira raro|respira rapido|agitad[oa] much|lengua (morada|azul|violeta)|encias (moradas|azules|palidas|blancas)|mucosas palidas|cianos/,
    razon: 'dificultad respiratoria o mucosas alteradas',
  },
  {
    clave: 'neurologico',
    patron: /convulsion|convulsiona|ataque epilep|epilep|espasmos|temblando mucho|tembloroso|se desmay|desmayo|colaps|no responde|inconsciente|no reacciona|camina en circulo|perdio el equilibrio|cabeza torcida/,
    razon: 'signos neurológicos (convulsión, colapso o alteración de la conciencia)',
  },
  {
    clave: 'trauma',
    patron: /atropell|lo pisó|lo piso un carro|se cayo de|cayo del|caida de altura|le pego un carro|mordido por otro perro|pelea con otro perro|herida (grande|abierta|profunda)|sangra mucho|hemorragia|no para de sangrar|hueso (afuera|expuesto)|fractura/,
    razon: 'trauma o sangrado activo',
  },
  {
    clave: 'intoxicacion',
    patron: /intoxic|envenen|comio veneno|raticida|rodenticida|se comio chocolate|xilitol|comio pastillas|se tomo|lamio (cloro|desinfectante|anticongelante)|mordio una serpiente|lo mordio una serpiente|picadura de (serpiente|abeja|avispa)|hinchada la cara|cara hinchada/,
    razon: 'sospecha de intoxicación o reacción alérgica aguda',
  },
  {
    clave: 'obstruccion_urinaria',
    patron: /no puede orinar|no ha orinado|no orina\b|intenta(ndo)? (orinar|hacer pipi) y no|puja(ndo)? (para|por) orinar|no hace pipi|no puede hacer pipi|orinar y no puede/,
    razon: 'posible obstrucción urinaria (en gatos machos es mortal en horas)',
  },
  {
    clave: 'torsion_gastrica',
    patron: /abdomen (hinchado|distendido|duro)|barriga (hinchada|dura|inflamada)|estomago hinchado|arcadas sin vomitar|intenta vomitar y no puede|nausea sin vomit/,
    razon: 'abdomen distendido con arcadas improductivas (posible torsión gástrica)',
  },
  {
    clave: 'parto',
    patron: /esta pariendo|en trabajo de parto|lleva horas pariendo|no puede parir|cachorro atorado|parto complicad/,
    razon: 'parto complicado (distocia)',
  },
  {
    clave: 'golpe_calor',
    patron: /golpe de calor|se sobrecalento|quedo encerrado en el carro|jadea sin parar/,
    razon: 'sospecha de golpe de calor',
  },
  {
    clave: 'ojo_prolapso',
    patron: /ojo (afuera|salido|se le salio)|se le salio el ojo|prolapso/,
    razon: 'urgencia oftalmológica o prolapso',
  },
  {
    clave: 'hemorragia_digestiva',
    patron: /vomit\w*( con)? sangre|sangre en el vomito|heces negras|popo negro|diarrea con mucha sangre|sangre por (el ano|la boca|la nariz)/,
    razon: 'sangrado digestivo activo',
  },
];

// ---------------------------------------------------------------------------
// Cuadros que sí se atienden a domicilio. Cada uno define qué debe alistar
// el veterinario y qué puede preparar el dueño antes de que llegue.
// ---------------------------------------------------------------------------

const CUADROS = [
  {
    clave: 'digestivo',
    // "parasitos" sí, "desparasitar" no: eso último es una visita de rutina,
    // no un perro enfermo. Por eso el \b y no un "parasit" suelto.
    patron: /vomit|guarcad|diarrea|deposicion blanda|heces blandas|popo blando|suelto del estomago|no hace bien del bano|\bparasitos?\b|lombrices|gusanos en el popo|comio algo que no debia/,
    nivel: 'alta',
    muestras: [
      'Coprológico directo + frotis (recoger muestra en sitio si el dueño no la tiene)',
      'Prueba rápida de parvovirus/moquillo si es cachorro o no está vacunado',
      'Hemograma y bioquímica básica (deshidratación y electrolitos)',
      'Kit de fluidoterapia subcutánea + antiemético inyectable',
    ],
    preparacion: [
      'Si alcanza a recoger una muestra de popó fresca (de menos de 2 horas) en una bolsa o frasco limpio, sirve muchísimo',
      'No le dé comida hasta que el veterinario lo revise; agua sí, en poquitos',
      'Tenga a la mano el carné de vacunas y desparasitación',
    ],
  },
  {
    clave: 'urinario',
    patron: /orina con sangre|sangre en la orina|orina mucho|toma mucha agua|se hace pipi en la casa|pipi con sangre|le arde al orinar|orina poquito|cistitis/,
    nivel: 'alta',
    muestras: [
      'Uroanálisis + tirilla reactiva (cistocentesis si no hay muestra libre)',
      'Frasco estéril para orina',
      'Bioquímica renal (BUN, creatinina)',
      'Ecógrafo portátil si está disponible (vejiga y riñones)',
    ],
    preparacion: [
      'Si logra recoger orina fresca en un frasco limpio y seco, guárdela refrigerada; si no, el veterinario la toma',
      'No lo saque a orinar justo antes de la cita, para que llegue con vejiga',
    ],
  },
  {
    clave: 'piel',
    patron: /se rasca|rascando|comezon|picazon|alergia|caida de pelo|se le cae el pelo|pelad[oa]|caspa|granos|ronchas|costras|sarna|pulgas|garrapatas|hongos|piel roja|se lame mucho|se muerde las patas/,
    nivel: 'media',
    muestras: [
      'Raspado cutáneo profundo y superficial (láminas + aceite mineral)',
      'Citología por impronta y cinta de acetato',
      'Tricograma',
      'Lámpara de Wood (descartar dermatofitos)',
    ],
    preparacion: [
      'No lo bañe ni le aplique cremas, talcos o remedios caseros en las 48 horas antes de la visita: eso borra la muestra',
      'Si le ha aplicado algún producto, tenga el empaque a la mano',
    ],
  },
  {
    clave: 'oido',
    patron: /oido|oreja|sacude la cabeza|se rasca la oreja|mal olor (en|de) (la oreja|el oido)|otitis|secrecion en el oido/,
    nivel: 'media',
    muestras: [
      'Citología ótica (hisopos + láminas)',
      'Otoscopio con conos desechables',
      'Solución de limpieza ótica',
    ],
    preparacion: ['No le limpie los oídos antes de la visita: la muestra debe tomarse tal como está'],
  },
  {
    clave: 'ojos',
    patron: /ojo (rojo|llorando|cerrado|nublado|opaco)|lagrime|legañ|secrecion en el ojo|no abre el ojo|se golpeo el ojo|conjuntivitis/,
    nivel: 'alta',
    muestras: [
      'Test de fluoresceína (descartar úlcera corneal)',
      'Test de Schirmer',
      'Colirio anestésico y solución salina estéril',
    ],
    preparacion: ['No le aplique gotas ni colirios de otra mascota o de humanos antes de la revisión'],
  },
  {
    clave: 'respiratorio',
    patron: /tos|tosiendo|estornuda|mocos|gripa|moquillo|ronquera|silbid|traqueobronq/,
    nivel: 'alta',
    muestras: [
      'Hemograma completo',
      'Oxímetro de pulso y fonendo',
      'Prueba rápida de moquillo si es cachorro o no está vacunado',
    ],
    preparacion: ['Anote hace cuántos días empezó la tos y si ha estado con otros perros o gatos'],
  },
  {
    clave: 'sistemico',
    patron: /decaid|triste|no come|no quiere comer|sin apetito|no se levanta|fiebre|caliente|adelgaz|perdio peso|debil|apatico|duerme todo el dia/,
    nivel: 'alta',
    muestras: [
      'Hemograma completo + bioquímica (renal y hepática)',
      'Prueba de hemoparásitos (ehrlichia / anaplasma / dirofilaria)',
      'Tubos con EDTA y tubos secos, termómetro',
    ],
    preparacion: [
      'Si puede, no le dé comida las 8 horas previas (agua sí): permite tomar los exámenes de sangre en ayuno el mismo día',
      'Tenga a la mano el carné de vacunas',
    ],
  },
  {
    clave: 'locomotor',
    patron: /cojea|cojeando|no apoya|no camina bien|se le doblan las patas|dolor en la pata|se lastimo la pata|cadera|columna|arrastra las patas/,
    nivel: 'alta',
    muestras: [
      'Examen ortopédico y neurológico completo',
      'Analgesia inyectable',
      'ADVERTENCIA: no hay radiografía a domicilio — si se sospecha fractura o hernia discal, hay que remitir a clínica',
    ],
    preparacion: ['Limite el movimiento: nada de escaleras, saltos ni paseos hasta la valoración'],
  },
  {
    clave: 'geriatrico',
    patron: /viejit|geriatric|adulto mayor|tiene (1[0-9]|[2-9][0-9]) anos|chequeo general|examen de sangre|perfil|control de rutina/,
    nivel: 'baja',
    muestras: [
      'Perfil geriátrico: hemograma + bioquímica renal/hepática',
      'Presión arterial',
      'Tubos EDTA y secos',
    ],
    preparacion: ['Ayuno de 8 a 12 horas antes de la cita (agua sí), para el perfil de sangre'],
  },
  {
    clave: 'vacunacion',
    patron: /vacun|refuerzo|rabia|polivalente|quintuple|sextuple|triple felina|carne de vacunas/,
    nivel: 'baja',
    muestras: [
      'Biológicos según carné (verificar refuerzo pendiente antes de salir)',
      'Carné de vacunación o uno nuevo',
      'Nevera portátil con gel refrigerante (cadena de frío)',
    ],
    preparacion: [
      'Tenga el carné de vacunas a la mano',
      'La mascota debe estar sana y desparasitada; si tiene síntomas, avísenos y lo revisamos primero',
    ],
  },
  {
    clave: 'desparasitacion',
    patron: /desparasit|antipulgas|pipeta|garrapaticida/,
    nivel: 'baja',
    muestras: ['Antiparasitario interno y externo según peso', 'Báscula portátil'],
    preparacion: ['Tenga a la mano el peso aproximado y la fecha de la última desparasitación'],
  },
  {
    clave: 'eutanasia',
    patron: /eutanasia|dormirlo|sacrificar|despedida|ya no tiene calidad de vida/,
    nivel: 'alta',
    muestras: [
      'Protocolo de eutanasia humanitaria y consentimiento informado',
      'Coordinar con el equipo antes de confirmar: requiere valoración previa',
    ],
    preparacion: [],
  },
];

// Recetas que no dependen de un síntoma sino de que sí o sí se van a tomar
// muestras de sangre: se avisa el ayuno una sola vez.
const AYUNO = 'Ayuno de 8 horas antes de la cita (agua sí) por si hay que tomar muestras de sangre';

function evaluarSintomas(texto) {
  const t = normalizar(texto);

  const banderas = BANDERAS_ROJAS.filter((b) => b.patron.test(t));
  const cuadros = CUADROS.filter((c) => c.patron.test(t));

  let nivel = 'media';
  if (cuadros.length) {
    nivel = cuadros.reduce((max, c) => (pesoNivel(c.nivel) > pesoNivel(max) ? c.nivel : max), 'baja');
  }
  // La urgencia declarada por el propio cliente nunca se baja, solo se sube.
  if (/\burgen|emergencia|de una|ya mismo|lo mas pronto|rapido por favor|se esta muriendo|grave\b/.test(t)) {
    if (pesoNivel(nivel) < pesoNivel('alta')) nivel = 'alta';
  }
  if (banderas.length) nivel = 'critica';

  const muestras = [...new Set(cuadros.flatMap((c) => c.muestras))];
  const preparacion = [...new Set(cuadros.flatMap((c) => c.preparacion))];

  return {
    nivel,
    critica: banderas.length > 0,
    // Motivos legibles de por qué se marcó como crítica — el agente los usa
    // para explicarle al cliente, y el veterinario los ve en su app.
    razonesCriticas: banderas.map((b) => b.razon),
    cuadros: cuadros.map((c) => c.clave),
    muestras,
    preparacion,
  };
}

// Texto compacto que se le devuelve al modelo tras agendar, para que se lo
// cuente al cliente con sus palabras (no se le manda una lista cruda).
function resumirPreparacion(evaluacion) {
  if (!evaluacion.preparacion.length) return null;
  return evaluacion.preparacion.join('. ');
}

// BANDERAS_ROJAS y CUADROS se exportan para que
// scripts/generar-tabla-triaje.js arme el documento que revisa el
// veterinario a partir de las reglas REALES. Si el documento se escribiera
// aparte, al primer cambio quedaría mintiendo.
module.exports = { evaluarSintomas, resumirPreparacion, NIVELES, AYUNO, BANDERAS_ROJAS, CUADROS };
