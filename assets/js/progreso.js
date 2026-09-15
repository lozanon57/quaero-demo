/**
 * Cuentas del alumno: cuántas lleva, cuántas le quedan, cuántas acierta.
 *
 * Una pregunta cuenta una sola vez, la primera. Si contáramos los repasos, el
 * contador de pendientes bajaría sin que el alumno hubiera visto nada nuevo, y
 * el porcentaje de aciertos subiría solo por repetir lo ya explicado. Las dos
 * cosas mentirían en la dirección agradable, que es la peor.
 */

/** Primer intento de cada pregunta, en orden de llegada. */
function primeros(intentos) {
  const m = new Map()
  for (const i of intentos) if (!m.has(i.pregunta_id)) m.set(i.pregunta_id, i)
  return [...m.values()]
}

const vacio = () => ({ hechas: 0, aciertos: 0, fallos: 0, sinCorregir: 0 })

/**
 * @param temas     inventario(): { n, titulo, bloque_nombre, test, corta, larga, disponible }
 * @param intentos  todos los intentos del alumno
 * @returns una fila por tema con sus cuentas, en el mismo orden del temario
 */
export function progresoPorTema(temas, intentos) {
  const porTema = new Map()
  for (const i of primeros(intentos)) {
    const c = porTema.get(i.tema) ?? vacio()
    c.hechas += 1
    if (i.correcto === true) c.aciertos += 1
    else if (i.correcto === false) c.fallos += 1
    else c.sinCorregir += 1
    porTema.set(i.tema, c)
  }

  return temas.map((t) => {
    const c = porTema.get(t.n) ?? vacio()
    const total = t.total ?? t.test + t.corta + t.larga
    const corregidas = c.aciertos + c.fallos
    return {
      ...t,
      total,
      hechas: c.hechas,
      aciertos: c.aciertos,
      fallos: c.fallos,
      // Pendientes nunca negativo: si el banco encoge al retirar un ítem malo,
      // un alumno puede tener más respondidas que preguntas quedan.
      pendientes: Math.max(0, total - c.hechas),
      // null, no cero: «todavía no lo sabemos» y «lo aciertas todo mal» no son
      // el mismo dato, y pintarlos igual sería una mentira por omisión.
      acierto: corregidas ? c.aciertos / corregidas : null,
    }
  })
}

/** Lo mismo, sumado sobre todos los temas. */
export function progresoGlobal(filas) {
  const s = filas.reduce(
    (a, f) => ({
      total: a.total + f.total,
      hechas: a.hechas + f.hechas,
      aciertos: a.aciertos + f.aciertos,
      fallos: a.fallos + f.fallos,
      temasEmpezados: a.temasEmpezados + (f.hechas > 0 ? 1 : 0),
      temasTerminados: a.temasTerminados + (f.total > 0 && f.pendientes === 0 ? 1 : 0),
    }),
    { total: 0, hechas: 0, aciertos: 0, fallos: 0, temasEmpezados: 0, temasTerminados: 0 },
  )
  const corregidas = s.aciertos + s.fallos
  return {
    ...s,
    pendientes: Math.max(0, s.total - s.hechas),
    acierto: corregidas ? s.aciertos / corregidas : null,
    avance: s.total ? s.hechas / s.total : 0,
  }
}
