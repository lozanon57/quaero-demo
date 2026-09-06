/**
 * Máquina de estados del quiz. Sin DOM: se le pregunta el estado y se le mandan
 * acciones; cada acción devuelve un estado NUEVO. Así la interfaz nunca puede
 * dejar el marcador y la pantalla contando cosas distintas.
 *
 * DOS MODOS, y la diferencia entre ellos es deliberada:
 *
 *   estudio — corrige al enviar cada pregunta y enseña la explicación en el
 *     acto. Es el modo por defecto porque el beneficio de la práctica de
 *     recuperación se potencia con retroalimentación inmediata que permita
 *     corregir el error mientras aún se recuerda por qué se falló.
 *
 *   examen — nada de corrección hasta el final, navegación libre entre
 *     preguntas, penalización de −0,33 y opción de dejar en blanco. Reproduce
 *     el examen del 26 de noviembre, incluida la decisión de arriesgar o no.
 */
import { CONFIG } from './config.js'
import { corregirCorta, analizarLarga, puntuarTest, marcador } from './correccion.js'

export const MODOS = Object.freeze({ ESTUDIO: 'estudio', EXAMEN: 'examen' })

/** Estado inicial. `preguntas` no se copia en profundidad: es de solo lectura. */
export function crearQuiz({ preguntas, modo = MODOS.ESTUDIO, temas = [], quizId = null, vistas = new Set() }) {
  return Object.freeze({
    quizId,
    // Ítems que este alumno ya había respondido antes de esta tanda. Sirve para
    // marcar primer_intento: la segunda vez que alguien ve una pregunta no es
    // una observación independiente, y meterla en la dificultad del ítem la
    // infla. El análisis psicométrico usa solo primeras exposiciones.
    vistas,
    modo,
    temas,
    preguntas,
    indice: 0,
    respuestas: Object.freeze({}),   // preguntaId -> { valor, enBlanco }
    correcciones: Object.freeze({}), // preguntaId -> resultado de corrección
    tiempos: Object.freeze({}),      // preguntaId -> { ms, msExplicacion }
    revelada: false,                 // en modo estudio: ¿se ve ya la explicación?
    iniciado: Date.now(),
    inicioPregunta: Date.now(),
    terminado: false,
  })
}

export const preguntaActual = (q) => q.preguntas[q.indice]
export const total = (q) => q.preguntas.length
export const respondidas = (q) => Object.keys(q.respuestas).length

/** Marca de progreso por pregunta, para la barra de navegación del modo examen. */
export function mapaProgreso(q) {
  return q.preguntas.map((p, i) => ({
    i,
    id: p.id,
    formato: p.formato,
    respondida: p.id in q.respuestas,
    enBlanco: q.respuestas[p.id]?.enBlanco ?? false,
    actual: i === q.indice,
    correcto: q.correcciones[p.id]?.correcto ?? null,
  }))
}

/** Anota la respuesta sin corregirla todavía. */
export function responder(q, valor) {
  const p = preguntaActual(q)
  if (!p || q.terminado) return q
  return Object.freeze({
    ...q,
    respuestas: Object.freeze({ ...q.respuestas, [p.id]: { valor, enBlanco: false } }),
  })
}

/** Deja la pregunta en blanco: en el examen real esto vale 0, no −0,33. */
export function dejarEnBlanco(q) {
  const p = preguntaActual(q)
  if (!p || q.terminado) return q
  return Object.freeze({
    ...q,
    respuestas: Object.freeze({ ...q.respuestas, [p.id]: { valor: null, enBlanco: true } }),
  })
}

function corregirPregunta(pregunta, respuesta) {
  const enBlanco = !respuesta || respuesta.enBlanco || respuesta.valor === null || respuesta.valor === ''
  if (pregunta.formato === 'test') {
    const correcto = !enBlanco && respuesta.valor === pregunta.correct_answer
    return { formato: 'test', correcto, enBlanco, puntuacion: puntuarTest({ correcto, enBlanco }) }
  }
  if (pregunta.formato === 'corta') {
    const r = corregirCorta(pregunta, respuesta?.valor ?? '')
    return { formato: 'corta', ...r, puntuacion: r.correcto ? CONFIG.examen.corta.porPregunta : 0 }
  }
  const a = analizarLarga(pregunta, respuesta?.valor ?? '')
  // La larga no se autopuntúa: se ofrece un orientativo y decide el alumno.
  return { formato: 'larga', ...a, enBlanco, correcto: null, puntuacion: null, autoevaluada: false }
}

/**
 * Modo estudio: corrige y revela la explicación. En modo examen no hace nada,
 * porque revelar la respuesta rompería el simulacro.
 */
export function comprobar(q) {
  const p = preguntaActual(q)
  if (!p || q.modo !== MODOS.ESTUDIO || q.revelada) return q
  const correccion = corregirPregunta(p, q.respuestas[p.id])
  const ms = Date.now() - q.inicioPregunta
  return Object.freeze({
    ...q,
    revelada: true,
    correcciones: Object.freeze({ ...q.correcciones, [p.id]: correccion }),
    tiempos: Object.freeze({ ...q.tiempos, [p.id]: { ms, msExplicacion: 0 } }),
  })
}

/** El alumno se puntúa la respuesta larga tras leer la rúbrica y el modelo. */
export function autoevaluarLarga(q, preguntaId, puntos) {
  const previa = q.correcciones[preguntaId]
  if (!previa || previa.formato !== 'larga') return q
  const max = CONFIG.examen.larga.porPregunta
  const acotado = Math.max(0, Math.min(max, Number(puntos) || 0))
  return Object.freeze({
    ...q,
    correcciones: Object.freeze({
      ...q.correcciones,
      [preguntaId]: { ...previa, puntuacion: acotado, autoevaluada: true, correcto: acotado >= max / 2 },
    }),
  })
}

/** Acumula el tiempo que la explicación estuvo delante del alumno. */
export function anotarLecturaExplicacion(q, preguntaId, ms) {
  const t = q.tiempos[preguntaId] ?? { ms: 0, msExplicacion: 0 }
  return Object.freeze({
    ...q,
    tiempos: Object.freeze({ ...q.tiempos, [preguntaId]: { ...t, msExplicacion: t.msExplicacion + ms } }),
  })
}

export function irA(q, indice) {
  if (q.terminado || indice < 0 || indice >= q.preguntas.length) return q
  const p = preguntaActual(q)
  const ms = Date.now() - q.inicioPregunta
  const tiempos =
    p && !(p.id in q.tiempos)
      ? { ...q.tiempos, [p.id]: { ms, msExplicacion: 0 } }
      : q.tiempos
  return Object.freeze({
    ...q,
    indice,
    revelada: false,
    inicioPregunta: Date.now(),
    tiempos: Object.freeze(tiempos),
  })
}

export const siguiente = (q) => irA(q, q.indice + 1)
export const anterior = (q) => irA(q, q.indice - 1)
export const haySiguiente = (q) => q.indice < q.preguntas.length - 1

/**
 * Cierra el quiz: en modo examen es aquí donde se corrige todo de una vez.
 *
 * Solo se corrige HASTA DONDE LLEGÓ el alumno. Antes se corregían también las
 * preguntas que nunca vio, de modo que abandonar en la 5 de 40 registraba 35
 * fallos: le hundía el porcentaje de aciertos por haberse ido, el motor
 * adaptativo le bajaba el nivel por preguntas que no leyó, y la variable de
 * exposición del estudio se llenaba de fantasmas. Se penalizaba justo la
 * autorregulación que una herramienta contra la ansiedad debe permitir.
 */
export function terminar(q) {
  const correcciones = { ...q.correcciones }
  const tiempos = { ...q.tiempos }
  const p = preguntaActual(q)
  if (p && !(p.id in tiempos)) tiempos[p.id] = { ms: Date.now() - q.inicioPregunta, msExplicacion: 0 }

  const vistas = q.preguntas.filter((x, i) => i <= q.indice || x.id in q.respuestas)
  for (const pregunta of vistas) {
    if (!(pregunta.id in correcciones)) {
      correcciones[pregunta.id] = corregirPregunta(pregunta, q.respuestas[pregunta.id])
    }
  }
  return Object.freeze({
    ...q,
    terminado: true,
    revelada: true,
    preguntasVistas: vistas.length,
    correcciones: Object.freeze(correcciones),
    tiempos: Object.freeze(tiempos),
  })
}

/** Filas listas para persistir como intentos, una por pregunta. */
export function intentosDe(q) {
  // Solo las preguntas realmente corregidas: las no vistas no generan intento.
  return q.preguntas.filter((p) => p.id in q.correcciones).map((p) => {
    const c = q.correcciones[p.id] ?? {}
    const r = q.respuestas[p.id]
    const t = q.tiempos[p.id] ?? {}
    const valor = r?.valor
    return {
      quiz_id: q.quizId,
      pregunta_id: p.id,
      tema: p.tema,
      bloque: p.bloque ?? null,
      formato: p.formato,
      categoria: p.categoria ?? null,
      dificultad: p.difficulty ?? null,
      respuesta: typeof valor === 'string' ? valor.slice(0, 4000) : valor ?? null,
      en_blanco: !!(r?.enBlanco ?? !r),
      correcto: c.correcto ?? null,
      puntuacion: c.puntuacion ?? null,
      ms_respuesta: Math.round(t.ms ?? 0),
      ms_explicacion: Math.round(t.msExplicacion ?? 0),
      primer_intento: !q.vistas?.has(p.id),
    }
  })
}

export function resultado(q) {
  const intentos = intentosDe(q)
  const m = marcador(intentos)
  const test = q.preguntas.filter((p) => p.formato === 'test')
  const dentroDe45 = test.filter((p) => (q.tiempos[p.id]?.ms ?? Infinity) <= CONFIG.segundosObjetivo * 1000)
  const msTest = test.map((p) => q.tiempos[p.id]?.ms ?? 0).filter(Boolean).sort((a, b) => a - b)
  return {
    marcador: m,
    intentos,
    minutos: Math.round((Date.now() - q.iniciado) / 60000),
    segundosMedianosTest: msTest.length ? Math.round(msTest[Math.floor(msTest.length / 2)] / 1000) : null,
    proporcionEn45s: test.length ? dentroDe45.length / test.length : null,
  }
}
