/**
 * Corrección automática y puntuación con las reglas del examen real.
 *
 * Alcance deliberado: la corrección automática se usa SOLO como retroalimentación
 * dentro de la plataforma. La evidencia disponible (Grévisse 2024; Quah 2024)
 * muestra concordancia moderada con el corrector humano y sesgo hacia la
 * severidad, así que aquí no se califica nada oficial. Las preguntas largas no
 * se puntúan solas: se detectan los elementos de la rúbrica y decide el alumno.
 */
import { CONFIG } from './config.js'

/**
 * Números escritos con letra -> dígito.
 *
 * Sin esto, la clave «12 ganglios» no casa con «doce ganglios», y el alumno que
 * escribe la cifra en letra recibe un «no lo has mencionado» que es falso. En
 * texto médico la mitad de los autores escribe una forma y la mitad la otra.
 */
const NUMEROS = Object.freeze({
  cero: '0', uno: '1', una: '1', un: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5',
  seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12',
  trece: '13', catorce: '14', quince: '15', dieciseis: '16', diecisiete: '17',
  dieciocho: '18', diecinueve: '19', veinte: '20', veintiuno: '21', veintidos: '22',
  veintitres: '23', veinticuatro: '24', veinticinco: '25', veintiseis: '26',
  veintisiete: '27', veintiocho: '28', veintinueve: '29', treinta: '30',
  cuarenta: '40', cincuenta: '50', sesenta: '60', setenta: '70', ochenta: '80',
  noventa: '90', cien: '100', ciento: '100', mil: '1000',
})

/** Quita tildes, signos y mayúsculas para poder comparar respuestas escritas. */
export function normalizar(t) {
  return String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // marcas diacriticas
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((p) => NUMEROS[p] ?? p)
    .join(' ')
    // Compuestos: «setenta y cinco» pasa palabra a palabra a «70 y 5», que no
    // casa con «75». Se recomponen las decenas con unidad.
    .replace(/\b([2-9])0 y ([1-9])\b/g, '$1$2')
}

export const contarPalabras = (t) => normalizar(t).split(' ').filter(Boolean).length

/** Distancia de edición acotada: suficiente para tolerar una errata de tecleo. */
function distancia(a, b) {
  if (a === b) return 0
  if (!a.length || !b.length) return Math.max(a.length, b.length)
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(
        previa[j] + 1,
        fila[j - 1] + 1,
        previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previa = fila
  }
  return previa[b.length]
}

/**
 * Prefijos que INVIERTEN el significado. Sin esta guarda, la distancia de
 * edicion daba por buena «hiperglucemia» cuando la clave era «hipoglucemia»
 * (dos ediciones), y «resecable» cuando la clave era «irresecable». La
 * plataforma acreditaba al alumno justo la respuesta clinicamente contraria,
 * que es peor que no corregir nada.
 */
const PREFIJOS_OPUESTOS = [
  ['hipo', 'hiper'], ['hipo', 'super'], ['micro', 'macro'], ['mini', 'maxi'],
  ['bradi', 'taqui'], ['pre', 'post'], ['intra', 'extra'], ['sub', 'supra'],
  ['endo', 'exo'], ['mono', 'poli'], ['uni', 'multi'], ['ante', 'retro'],
]
/** Prefijos privativos: su presencia o ausencia cambia el signo. */
const PRIVATIVOS = ['ir', 'in', 'im', 'a', 'des', 'anti', 'no', 'neo']

function invierteSignificado(a, b) {
  for (const [x, y] of PREFIJOS_OPUESTOS) {
    if ((a.startsWith(x) && b.startsWith(y)) || (a.startsWith(y) && b.startsWith(x))) return true
  }
  // «resecable» vs «irresecable», «adyuvante» vs «neoadyuvante»
  for (const p of PRIVATIVOS) {
    if (a === p + b || b === p + a) return true
  }
  return false
}

/** Palabras que niegan lo que viene detrás. */
const NEGACIONES = new Set(['no', 'ni', 'sin', 'nunca', 'jamas', 'descarta', 'descartar',
  'descartada', 'descartado', 'contraindicado', 'contraindicada', 'evitar', 'excluye', 'salvo'])

/**
 * ¿Está el concepto negado justo antes de donde aparece?
 *
 * Ventana de cuatro palabras: «no está indicada la resección» pone la negación
 * a cuatro de distancia. Es un compromiso — una ventana más larga atraparía
 * negaciones de la frase anterior, y al normalizar se pierde la puntuación que
 * marcaría el corte. Se prefiere errar hacia el falso negativo: no acreditar
 * algo que el alumno sí dijo se corrige mirando la respuesta; acreditarle lo
 * contrario de lo que dijo le enseña el error.
 */
const VENTANA_NEGACION = 4

function estaNegado(palabras, posicion) {
  for (let i = Math.max(0, posicion - VENTANA_NEGACION); i < posicion; i++) {
    if (NEGACIONES.has(palabras[i])) return true
  }
  return false
}

/**
 * ¿Aparece el concepto en la respuesta, tolerando una errata y el plural?
 *
 * Tres guardas, y las tres nacen de fallos reales: no cruzar prefijos que
 * invierten el significado, tolerancia de edicion mas estrecha, y no dar por
 * cubierto un concepto que el alumno ha NEGADO expresamente.
 */
function contieneConcepto(respuesta, concepto) {
  const c = normalizar(concepto)
  if (!c) return false
  const palabras = respuesta.split(' ')
  // Si la CLAVE ya lleva la negación dentro («no reintervención», «sin margen»),
  // la guarda de negación no se aplica: estaría rechazando exactamente el texto
  // que se busca. Es el fallo que introdujo la guarda al añadirla.
  const claveNegada = NEGACIONES.has(c.split(' ')[0])

  // Coincidencia literal, pero comprobando que no venga negada.
  const idx = palabras.findIndex((_, i) => palabras.slice(i).join(' ').startsWith(c))
  if (idx >= 0) return claveNegada || !estaNegado(palabras, idx)

  // Coincidencia tolerante: solo para claves largas y nunca cruzando prefijos.
  const tolerancia = c.length <= 8 ? 0 : 1
  if (tolerancia === 0) return false
  const j = palabras.findIndex((p) => !invierteSignificado(p, c) && distancia(p, c) <= tolerancia)
  return j >= 0 ? claveNegada || !estaNegado(palabras, j) : false
}

/**
 * Corrige una pregunta de respuesta corta.
 * Correcta si están todos los conceptos clave, o si coincide con la respuesta
 * canónica o con alguna variante aceptada.
 */
export function corregirCorta(pregunta, respuesta) {
  const dada = normalizar(respuesta)
  const palabras = contarPalabras(respuesta)
  const limite = pregunta.max_palabras ?? CONFIG.examen.corta.maxPalabras

  if (!dada) {
    return { correcto: false, enBlanco: true, palabras: 0, faltan: pregunta.conceptos_clave ?? [], excedeLimite: false }
  }

  const variantes = [pregunta.respuesta_canonica, ...(pregunta.aceptadas ?? [])].filter(Boolean).map(normalizar)
  const coincideVariante = variantes.some((v) => dada === v || (v.length > 12 && dada.includes(v)))

  const claves = pregunta.conceptos_clave ?? []
  const presentes = claves.filter((c) => contieneConcepto(dada, c))
  const faltan = claves.filter((c) => !contieneConcepto(dada, c))
  const todasLasClaves = claves.length > 0 && faltan.length === 0

  return {
    correcto: coincideVariante || todasLasClaves,
    parcial: !coincideVariante && !todasLasClaves && presentes.length > 0,
    enBlanco: false,
    palabras,
    excedeLimite: palabras > limite,
    presentes,
    faltan,
  }
}

/**
 * "Corrige" una pregunta larga: localiza qué elementos de la rúbrica aparecen y
 * devuelve el desglose. No emite nota: la puntuación final la pone el alumno
 * comparando con la respuesta modelo, que es lo honesto con la evidencia.
 */
export function analizarLarga(pregunta, respuesta) {
  const dada = normalizar(respuesta)
  const palabras = contarPalabras(respuesta)
  const limite = pregunta.max_palabras ?? CONFIG.examen.larga.maxPalabras

  const elementos = (pregunta.rubrica ?? []).map((r) => {
    const claves = r.claves ?? []
    const encontradas = claves.filter((c) => contieneConcepto(dada, c))
    return {
      elemento: r.elemento,
      puntos: r.puntos ?? 0,
      claves,
      encontradas,
      cubierto: claves.length > 0 && encontradas.length === claves.length,
      parcial: encontradas.length > 0 && encontradas.length < claves.length,
    }
  })

  const cubiertos = elementos.filter((e) => e.cubierto).length
  return {
    palabras,
    excedeLimite: palabras > limite,
    elementos,
    cubiertos,
    totalElementos: elementos.length,
    orientativo: elementos.length ? cubiertos / elementos.length : 0,
  }
}

/** Puntúa un test con las reglas del examen: +1 / −0,33 / 0. */
export function puntuarTest({ correcto, enBlanco }) {
  const { acierto, fallo, blanco } = CONFIG.examen.test
  if (enBlanco) return blanco
  return correcto ? acierto : fallo
}

/**
 * Marcador de un quiz en la escala del examen real, para que el número que ve
 * el alumno signifique lo mismo que el del 26 de noviembre.
 */
export function marcador(intentos) {
  const de = (f) => intentos.filter((i) => i.formato === f)
  const test = de('test')
  const cortas = de('corta')
  const largas = de('larga')

  const brutoTest = test.reduce((a, i) => a + (i.puntuacion ?? 0), 0)
  const puntosCortas = cortas.filter((i) => i.correcto).length * CONFIG.examen.corta.porPregunta
  const puntosLargas = largas.reduce((a, i) => a + (i.puntuacion ?? 0), 0)

  const enBlanco = test.filter((i) => i.en_blanco).length
  const aciertos = test.filter((i) => i.correcto).length
  const fallos = test.length - aciertos - enBlanco

  return {
    test: { n: test.length, aciertos, fallos, enBlanco, puntos: Math.max(0, brutoTest), brutoTest },
    corta: { n: cortas.length, aciertos: cortas.filter((i) => i.correcto).length, puntos: puntosCortas },
    larga: { n: largas.length, puntos: puntosLargas },
    total: Math.max(0, brutoTest) + puntosCortas + puntosLargas,
    // Equivalencia sobre 100 puntos del examen, solo si el quiz tuvo test.
    sobre100: test.length
      ? Math.max(0, (brutoTest / test.length) * CONFIG.examen.test.puntos) +
        (cortas.length ? (puntosCortas / cortas.length) * CONFIG.examen.corta.puntos : 0) +
        (largas.length ? (puntosLargas / (largas.length * CONFIG.examen.larga.porPregunta)) * CONFIG.examen.larga.puntos : 0)
      : null,
  }
}
