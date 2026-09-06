/**
 * Carga y puntuación de los cuestionarios del estudio.
 *
 * Los instrumentos viven en datos/cuestionarios/*.json y no en el código, para
 * que se puedan cambiar sin tocar la aplicación y para que quede claro cuál se
 * administró: cada respuesta guarda el id y la versión del instrumento.
 *
 * Un instrumento con `estado: "PENDIENTE_DE_ITEMS"` NO se muestra. Es el caso de
 * la CAEX: sus ítems son de una escala publicada y hay que transcribirlos de la
 * fuente, no reconstruirlos. Enseñar una versión inventada de un instrumento
 * validado produce una puntuación que parece comparable con la literatura y no
 * lo es, que es peor que no medir nada.
 */
const RUTA = 'datos/cuestionarios'
const FICHEROS = ['01_experiencia.json']

let cache = null

export async function cargarInstrumentos() {
  if (cache) return cache
  const cargados = await Promise.all(
    FICHEROS.map(async (f) => {
      try {
        const r = await fetch(`${RUTA}/${f}`)
        return r.ok ? await r.json() : null
      } catch {
        return null
      }
    }),
  )
  cache = cargados.filter(Boolean).filter((i) => i.estado !== 'PENDIENTE_DE_ITEMS' && i.preguntas?.length)
  return cache
}

/**
 * Los que quedan por responder. Ninguno bloquea: el componente A necesita
 * respuestas a las PREGUNTAS, no covariables del alumno, y un cuestionario
 * obligatorio antes de la primera pregunta solo compraría deserción — y encima
 * diferencial, porque se caen antes los que peor van.
 */
export async function pendientes(yaRespondidos) {
  const hechos = new Set(yaRespondidos.map((c) => c.tipo))
  return (await cargarInstrumentos()).filter((i) => !hechos.has(i.id))
}

/** ¿Está toda pregunta obligatoria contestada? */
export function completo(instrumento, respuestas) {
  return instrumento.preguntas
    .filter((p) => p.requerida)
    .every((p) => {
      const v = respuestas[p.id]
      if (p.tipo === 'multiple') return Array.isArray(v) && v.length > 0
      return v !== undefined && v !== null && v !== ''
    })
}

/**
 * Puntuación total, solo para instrumentos que la definen (escalas sumativas).
 * Los cuestionarios de covariables no puntúan: devolver un número para ellos
 * sería inventarse un constructo que no existe.
 */
export function puntuar(instrumento, respuestas) {
  const escalas = instrumento.preguntas.filter((p) => p.tipo === 'escala')
  if (!instrumento.instrumento?.rango_puntuacion && escalas.length === 0) return null
  const valores = escalas.map((p) => Number(respuestas[p.id])).filter((n) => !Number.isNaN(n))
  if (!valores.length) return null
  return valores.reduce((a, b) => a + b, 0)
}

/** Etiqueta interpretativa, si el instrumento la trae. */
export function interpretar(instrumento, puntuacion) {
  const tabla = instrumento.instrumento?.interpretacion
  if (!tabla || puntuacion === null) return null
  return tabla.find((t) => puntuacion >= t.desde && puntuacion <= t.hasta)?.etiqueta ?? null
}
