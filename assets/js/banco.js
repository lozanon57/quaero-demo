/**
 * Carga del banco de preguntas y selección para un quiz.
 *
 * El banco vive en datos/banco/tema_NN.json — contenido público, sin datos
 * personales, así que se sirve como ficheros estáticos y se cachea. Lo que es
 * privado (quién responde qué) va a la base de datos, nunca aquí.
 */
import { ADAPTATIVO } from './config.js'

const RUTA_BANCO = 'datos/banco'
const RUTA_TEMARIO = 'contenidos/temario.json'
const RUTA_INDICE = 'datos/banco/indice.json'

let cacheTemario = null
let cacheIndice = null
const cacheTemas = new Map()

/**
 * Inventario del banco, escrito por scripts/consolidar.py. Se consulta antes de
 * pedir nada: sin el, la aplicacion iba pidiendo los 30 ficheros y coleccionaba
 * un 404 por cada tema todavia sin preguntas.
 */
export async function cargarIndice() {
  if (cacheIndice) return cacheIndice
  try {
    const r = await fetch(RUTA_INDICE)
    cacheIndice = r.ok ? await r.json() : { temas: [] }
  } catch {
    cacheIndice = { temas: [] }
  }
  return cacheIndice
}

export async function cargarTemario() {
  if (cacheTemario) return cacheTemario
  const r = await fetch(RUTA_TEMARIO)
  if (!r.ok) throw new Error(`No se pudo cargar el temario (${r.status})`)
  cacheTemario = await r.json()
  return cacheTemario
}

export async function cargarTema(n) {
  if (cacheTemas.has(n)) return cacheTemas.get(n)
  const { temas } = await cargarIndice()
  if (temas.length && !temas.some((t) => t.n === n)) {
    cacheTemas.set(n, [])
    return []
  }
  const r = await fetch(`${RUTA_BANCO}/tema_${String(n).padStart(2, '0')}.json`)
  if (!r.ok) {
    cacheTemas.set(n, [])
    return []
  }
  const preguntas = await r.json()
  const conTema = preguntas.map((p) => ({ ...p, tema: p.tema ?? n }))
  cacheTemas.set(n, conTema)
  return conTema
}

export async function cargarTemas(numeros) {
  const bloques = await Promise.all(numeros.map(cargarTema))
  return bloques.flat()
}

/** Estado del banco por tema: cuántas preguntas hay de cada formato. */
export async function inventario() {
  const [{ temas }, indice] = await Promise.all([cargarTemario(), cargarIndice()])
  const porNumero = new Map(indice.temas.map((t) => [t.n, t]))
  return temas.map((t) => {
    const i = porNumero.get(t.n)
    return {
      ...t,
      test: i?.test ?? 0,
      corta: i?.corta ?? 0,
      larga: i?.larga ?? 0,
      total: i?.total ?? 0,
      disponible: (i?.total ?? 0) > 0,
    }
  })
}

/** Baraja sin mutar la entrada (Fisher-Yates sobre una copia). */
function barajar(xs) {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Decide el régimen de dificultad a partir del rendimiento reciente del alumno.
 * Devuelve también por qué, para poder enseñárselo y para registrarlo: el
 * régimen es una co-intervención que varía entre alumnos y el protocolo exige
 * saber cuál recibió cada uno.
 */
export function regimenDificultad(intentos) {
  const recientes = intentos
    .filter((i) => i.formato === 'test' && i.correcto !== null && !i.en_blanco)
    .slice(-ADAPTATIVO.ventana)

  if (recientes.length < ADAPTATIVO.minimoParaAdaptar) {
    return { regimen: 'media', acierto: null, n: recientes.length,
             motivo: 'Aún no hay respuestas suficientes para ajustar la dificultad.' }
  }

  const acierto = recientes.filter((i) => i.correcto).length / recientes.length
  if (acierto > ADAPTATIVO.banda.max) {
    return { regimen: 'dificil', acierto, n: recientes.length,
             motivo: `Vas acertando el ${Math.round(acierto * 100)} % de las últimas. Te subo el nivel.` }
  }
  if (acierto < ADAPTATIVO.banda.min) {
    return { regimen: 'facil', acierto, n: recientes.length,
             motivo: `Vas acertando el ${Math.round(acierto * 100)} %. Bajo el nivel para asentar antes de apretar.` }
  }
  return { regimen: 'media', acierto, n: recientes.length,
           motivo: `Vas acertando el ${Math.round(acierto * 100)} %, que es la banda en la que más se aprende.` }
}

/** Reparte n preguntas entre los tres niveles segun la mezcla del regimen. */
function cuposPorNivel(n, regimen) {
  const mezcla = ADAPTATIVO.mezclas[regimen] ?? ADAPTATIVO.mezclas.media
  const cupos = {
    basica: Math.round(n * mezcla.basica),
    intermedia: Math.round(n * mezcla.intermedia),
    extrema: Math.round(n * mezcla.extrema),
  }
  // El redondeo puede desviarse un item: se cuadra en la intermedia, que es la
  // mas abundante y la que menos se nota.
  cupos.intermedia += n - (cupos.basica + cupos.intermedia + cupos.extrema)
  return cupos
}

/**
 * Elige las preguntas de un quiz repartiéndolas entre los temas pedidos, para
 * que pedir 20 preguntas de cinco temas no devuelva 18 de uno y 2 de otro.
 * `vistas` es el conjunto de ids ya respondidos: se dejan para el final, de modo
 * que el alumno vea preguntas nuevas antes que repetidas.
 */
export async function seleccionar({ temas, formato, n, vistas = new Set(), regimen = null }) {
  const porTema = await Promise.all(
    temas.map(async (t) => {
      const qs = (await cargarTema(t)).filter((q) => formato === 'mixto' || q.formato === formato)
      const nuevas = barajar(qs.filter((q) => !vistas.has(q.id)))
      const repetidas = barajar(qs.filter((q) => vistas.has(q.id)))
      return [...nuevas, ...repetidas]
    }),
  )

  // Ronda robin entre temas: pedir 20 de cinco temas no puede devolver 18 de uno.
  const enOrden = []
  let quedanColas = true
  for (let i = 0; quedanColas; i++) {
    quedanColas = false
    for (const cola of porTema) {
      if (i < cola.length) {
        quedanColas = true
        enOrden.push(cola[i])
      }
    }
  }

  // Sin régimen (formatos sin dificultad util, o modo examen) se toma tal cual.
  if (!regimen || formato === 'larga') return barajar(enOrden.slice(0, n))

  const cupos = cuposPorNivel(n, regimen)
  const elegidas = []
  const sobrantes = []
  for (const q of enOrden) {
    const nivel = q.difficulty ?? 'intermedia'
    if ((cupos[nivel] ?? 0) > 0) {
      cupos[nivel] -= 1
      elegidas.push(q)
    } else {
      sobrantes.push(q)
    }
  }
  // Si un nivel no tenia bastantes preguntas, se completa con lo que haya: es
  // preferible una tanda completa a una tanda corta por cuadrar un porcentaje.
  return barajar([...elegidas, ...sobrantes].slice(0, n))
}

/**
 * Simulacro completo con la estructura del examen real: 70 test, 15 cortas y
 * 5 largas, repartidas por todo el temario.
 */
export async function simulacroCompleto(temasDisponibles) {
  const [test, corta, larga] = await Promise.all([
    seleccionar({ temas: temasDisponibles, formato: 'test', n: 70 }),
    seleccionar({ temas: temasDisponibles, formato: 'corta', n: 15 }),
    seleccionar({ temas: temasDisponibles, formato: 'larga', n: 5 }),
  ])
  return [...test, ...corta, ...larga]
}
