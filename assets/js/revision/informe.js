/**
 * Informe de revisión del banco.
 *
 * Convierte las marcas del revisor en un documento Markdown que se descarga y
 * se manda por correo. Markdown y no PDF a propósito: es lo que consume el
 * generador de Word de la casa (`md2docx.py`), así que el mismo fichero sirve
 * para leerlo en el momento y para producir el docx del expediente sin volver a
 * escribir nada.
 */

const FORMATO = { test: 'Test', corta: 'Respuesta corta', larga: 'Desarrollo' }

const fechaLarga = () =>
  new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

/** Una pregunta entera, tal como hay que verla para decidir sobre ella. */
function bloquePregunta(p, marca) {
  const l = []
  l.push(`### ${p.id} · Tema ${p.tema} · ${FORMATO[p.formato] ?? p.formato} · ${p.difficulty}`)
  l.push('')
  l.push(`**Enunciado.** ${p.stem}`)
  l.push('')

  if (p.formato === 'test') {
    for (const o of p.options ?? []) {
      const clave = o.id === p.correct_answer ? ' ← clave' : ''
      l.push(`- **${o.id}.** ${o.text}${clave}`)
    }
    l.push('')
  } else if (p.formato === 'corta') {
    l.push(`**Respuesta canónica.** ${p.respuesta_canonica ?? '—'}`)
    l.push('')
    if (p.aceptadas?.length) {
      l.push(`**También se aceptan.** ${p.aceptadas.join('; ')}`)
      l.push('')
    }
  } else {
    l.push(`**Respuesta modelo.** ${p.respuesta_modelo ?? '—'}`)
    l.push('')
    if (p.rubrica?.length) {
      l.push('**Rúbrica.**')
      l.push('')
      l.push('| Elemento | Puntos |')
      l.push('|---|---|')
      for (const r of p.rubrica) l.push(`| ${r.elemento} | ${r.puntos} |`)
      l.push('')
    }
  }

  l.push(`**Explicación.** ${p.explanation ?? '—'}`)
  l.push('')
  if (p.teaching_point) {
    l.push(`**Punto de enseñanza.** ${p.teaching_point}`)
    l.push('')
  }
  const fuentes = [p.guideline_ref, p.trial_ref].filter(Boolean)
  if (fuentes.length) {
    l.push(`**Referencias citadas.** ${fuentes.join(' · ')}`)
    l.push('')
  }
  l.push(`**Observación del revisor.** ${marca?.nota?.trim() || '(sin nota)'}`)
  l.push('')
  l.push('---')
  l.push('')
  return l.join('\n')
}

/**
 * @param preguntas  las 503, en el orden en que se revisaron
 * @param marcas     una por pregunta con dictamen; estado 'revisar' o 'ok'
 * @param revisor    correo de quien revisa
 */
export function construirInforme(preguntas, marcas, revisor) {
  const porId = new Map(marcas.map((m) => [m.pregunta_id, m]))
  const senaladas = preguntas.filter((p) => porId.get(p.id)?.estado === 'revisar')
  const conformes = preguntas.filter((p) => porId.get(p.id)?.estado === 'ok')
  const sinVer = preguntas.filter((p) => !porId.has(p.id))

  const porTema = new Map()
  for (const p of senaladas) porTema.set(p.tema, (porTema.get(p.tema) ?? 0) + 1)

  const l = []
  l.push('# Revisión del banco de preguntas QUAERO')
  l.push('')
  l.push('## Preguntas señaladas para repasar entre los dos autores')
  l.push('')
  l.push(`**Revisor:** ${revisor}`)
  l.push('')
  l.push(`**Fecha:** ${fechaLarga()}`)
  l.push('')
  l.push('---')
  l.push('')
  l.push('## Resumen')
  l.push('')
  l.push(
    `De las ${preguntas.length} preguntas del banco se han revisado ${conformes.length + senaladas.length}. ` +
      `El revisor da por buenas ${conformes.length} y señala ${senaladas.length} para repasar. ` +
      (sinVer.length
        ? `Quedan ${sinVer.length} sin dictamen, que no aparecen en este informe.`
        : 'No queda ninguna sin dictamen.'),
  )
  l.push('')

  if (porTema.size) {
    l.push('| Tema | Señaladas |')
    l.push('|---|---|')
    for (const [tema, n] of [...porTema].sort((a, b) => a[0] - b[0])) l.push(`| ${tema} | ${n} |`)
    l.push('')
  }

  l.push('---')
  l.push('')

  if (!senaladas.length) {
    l.push('## Sin preguntas señaladas')
    l.push('')
    l.push('El revisor no ha marcado ninguna pregunta para repasar.')
    l.push('')
  } else {
    l.push('## Las preguntas señaladas, una por una')
    l.push('')
    for (const p of senaladas) l.push(bloquePregunta(p, porId.get(p.id)))
  }

  if (conformes.length) {
    l.push('## Anexo: preguntas dadas por buenas')
    l.push('')
    l.push(
      'Se listan solo por su identificador, para que quede constancia de que se ' +
        'miraron y no de que se saltaron.',
    )
    l.push('')
    l.push(conformes.map((p) => p.id).join(', '))
    l.push('')
  }

  const marca = new Date().toISOString().slice(0, 10)
  return {
    md: l.join('\n'),
    nombre: `revision_banco_quaero_${marca}.md`,
    resumen: { total: preguntas.length, senaladas: senaladas.length, conformes: conformes.length, sinVer: sinVer.length },
  }
}

/** Cuerpo corto para el correo. El documento va adjunto: en un mailto no cabe. */
export function cuerpoCorreo(resumen, nombre, revisor) {
  return [
    `Revisión del banco QUAERO terminada por ${revisor}.`,
    '',
    `Revisadas: ${resumen.conformes + resumen.senaladas} de ${resumen.total}.`,
    `Señaladas para repasar: ${resumen.senaladas}.`,
    `Dadas por buenas: ${resumen.conformes}.`,
    resumen.sinVer ? `Sin dictamen: ${resumen.sinVer}.` : '',
    '',
    `Adjunto el documento con las señaladas: ${nombre}`,
    '(se acaba de descargar en esta misma máquina).',
  ]
    .filter((x) => x !== null)
    .join('\n')
}
