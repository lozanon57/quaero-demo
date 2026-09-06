/**
 * Vista del quiz. Renderiza el estado que le da quiz.js y le devuelve acciones;
 * no guarda estado propio salvo el nodo y el cronómetro.
 */
import { h, crudo, render, alPulsar, esc, reloj, pct } from '../ui.js'
import { CONFIG, CLASES_PUBLICADAS } from '../config.js'
import * as Q from '../quiz.js'
import { db } from '../db.js'

/** Enlace al material del profesor. En PDF se salta a la página exacta. */
function enlaceClase(fuente) {
  if (!fuente?.archivo) return ''
  // Sin el material publicado no se enseña nada: un nombre de fichero y un
  // número de diapositiva que el alumno no puede abrir no es una fuente, es
  // ruido. La procedencia sigue en el banco para el blueprint del examen.
  if (!CLASES_PUBLICADAS) return ''
  const archivo = encodeURIComponent(fuente.archivo)
  // Number(): la pagina va dentro del href, y un valor no numerico lo rompe.
  const pagina = Number.parseInt(fuente.pagina, 10)
  const ancla = /\.pdf$/i.test(fuente.archivo) && Number.isFinite(pagina) ? `#page=${pagina}` : ''
  const etiqueta = fuente.pagina ? `Ver en la clase · p. ${fuente.pagina}` : 'Ver en la clase'
  return `<a class="pildora acento" href="clases/${archivo}${ancla}" target="_blank" rel="noopener">${esc(etiqueta)}</a>`
}

function bloqueExplicacion(p, correccion) {
  const partes = []
  partes.push(`<h3>Explicación</h3><p>${esc(p.explanation ?? '')}</p>`)
  if (p.teaching_point) partes.push(`<div class="perla">${esc(p.teaching_point)}</div>`)

  const fuentes = []
  const clase = p.fuente_clase?.archivo ? enlaceClase(p.fuente_clase) : ''
  if (clase) fuentes.push(clase)
  else if (CLASES_PUBLICADAS && p.fuente_clase?.nota)
    fuentes.push(`<span class="pildora aviso">${esc(p.fuente_clase.nota)}</span>`)
  if (p.guideline_ref) fuentes.push(`<span class="pildora">${esc(p.guideline_ref)}</span>`)
  if (p.trial_ref) fuentes.push(`<span class="pildora">${esc(p.trial_ref)}</span>`)
  fuentes.push(`<button class="sutil pequeno" data-errata="${esc(p.id)}">Avisar de un error</button>`)
  partes.push(`<div class="fuentes">${fuentes.join('')}</div>`)

  return `<div class="explicacion">${partes.join('')}</div>`
}

function pintarTest(p, q) {
  const elegida = q.respuestas[p.id]?.valor
  const revelada = q.revelada || q.terminado
  const opciones = p.options
    .map((o) => {
      const clases = ['opcion']
      if (revelada && o.id === p.correct_answer) clases.push('correcta')
      else if (revelada && o.id === elegida) clases.push('incorrecta')
      else if (o.id === elegida) clases.push('elegida')
      return `<button type="button" class="${clases.join(' ')}" data-opcion="${esc(o.id)}" ${revelada ? 'disabled' : ''}>
        <span class="letra">${o.id}</span><span>${esc(o.text)}</span></button>`
    })
    .join('')
  const dictado = revelada
    ? `<p class="sr" aria-live="polite">${
        elegida === p.correct_answer
          ? 'Correcto.'
          : `Incorrecto. La respuesta era la ${p.correct_answer}.`
      }</p>`
    : ''
  return `<div class="opciones">${opciones}</div>${dictado}`
}

function pintarCorta(p, q) {
  const valor = q.respuestas[p.id]?.valor ?? ''
  const revelada = q.revelada || q.terminado
  const c = q.correcciones[p.id]
  const limite = p.max_palabras ?? CONFIG.examen.corta.maxPalabras

  let retro = ''
  if (revelada && c) {
    const estado = c.correcto
      ? '<span class="pildora bien">Correcta</span>'
      : c.parcial
        ? '<span class="pildora aviso">Parcialmente correcta</span>'
        : '<span class="pildora mal">Incorrecta</span>'
    const faltan = c.faltan?.length
      ? `<p class="ayuda">Faltaba mencionar: <strong>${c.faltan.map(esc).join(', ')}</strong></p>`
      : ''
    retro = `<div style="margin-top:.8rem">${estado}
      <p style="margin-top:.6rem"><strong>Respuesta:</strong> ${esc(p.respuesta_canonica ?? '')}</p>
      ${faltan}
      ${c.excedeLimite ? `<p class="ayuda" style="color:var(--aviso)">Te has pasado del límite de ${limite} palabras.</p>` : ''}
    </div>`
  }

  return `<div class="campo">
    <label for="resp-corta">Tu respuesta <span style="font-weight:400;color:var(--tinta-suave)">(máximo ${limite} palabras)</span></label>
    <input type="text" id="resp-corta" value="${esc(valor)}" ${revelada ? 'disabled' : ''}
           autocomplete="off" placeholder="Responde en pocas palabras">
    <div class="ayuda"><span id="cuenta-palabras">0</span> / ${limite} palabras</div>
  </div>${retro}`
}

function pintarLarga(p, q) {
  const valor = q.respuestas[p.id]?.valor ?? ''
  const revelada = q.revelada || q.terminado
  const c = q.correcciones[p.id]
  const limite = p.max_palabras ?? CONFIG.examen.larga.maxPalabras

  let retro = ''
  if (revelada && c) {
    const filas = (c.elementos ?? [])
      .map(
        (e) =>
          `<tr><td>${e.cubierto ? '<span class="pildora bien">sí</span>' : e.parcial ? '<span class="pildora aviso">a medias</span>' : '<span class="pildora mal">no</span>'}</td>
           <td>${esc(e.elemento)}</td><td class="num">${e.puntos}</td></tr>`,
      )
      .join('')
    const max = CONFIG.examen.larga.porPregunta
    retro = `
      <div class="aviso-caja">
        <strong>Esto no es una nota.</strong> La corrección automática de respuestas largas no es
        fiable: aquí solo se te señala qué elementos de la rúbrica ha detectado el sistema.
        Compara con la respuesta modelo y ponte tú la puntuación.
      </div>
      <div class="tabla-scroll"><table>
        <thead><tr><th>Detectado</th><th>Elemento de la rúbrica</th><th class="num">Puntos</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
      <details style="margin-top:1rem"><summary style="cursor:pointer;font-weight:600">Ver la respuesta modelo</summary>
        <p style="margin-top:.7rem;white-space:pre-wrap">${esc(p.respuesta_modelo ?? '')}</p></details>
      <div class="campo" style="margin-top:1rem">
        <label for="autoeval">Tu puntuación (0 a ${max})</label>
        <input type="number" id="autoeval" min="0" max="${max}" step="0.5"
               value="${c.autoevaluada ? c.puntuacion : ''}" style="max-width:8rem">
      </div>`
  }

  return `<div class="campo">
    <label for="resp-larga">Tu respuesta <span style="font-weight:400;color:var(--tinta-suave)">(máximo ${limite} palabras)</span></label>
    <textarea id="resp-larga" rows="10" ${revelada ? 'disabled' : ''}
              placeholder="Desarrolla la respuesta">${esc(valor)}</textarea>
    <div class="ayuda"><span id="cuenta-palabras">0</span> / ${limite} palabras</div>
  </div>${retro}`
}

export function vistaQuiz(destino, quizInicial, { alTerminar, registrar }) {
  let q = quizInicial
  let inicioExplicacion = null
  const esExamen = q.modo === Q.MODOS.EXAMEN
  const finExamen = esExamen ? Date.now() + CONFIG.examen.minutos * 60000 : null

  const nodo = render(destino, '<div></div>')
  let cronometro = null

  function pintar() {
    const p = Q.preguntaActual(q)
    if (!p) return
    const revelada = q.revelada || q.terminado
    const n = Q.total(q)

    const navegador = esExamen
      ? `<div class="navegador">${Q.mapaProgreso(q)
          .map(
            (m) =>
              `<button type="button" data-ir="${m.i}" class="${m.respondida ? (m.enBlanco ? 'en-blanco' : 'respondida') : ''}${m.actual ? ' actual' : ''}">${m.i + 1}</button>`,
          )
          .join('')}</div>`
      : ''

    const acciones = revelada
      ? `<button class="primario" id="siguiente">${Q.haySiguiente(q) ? 'Siguiente' : 'Ver resultado'}</button>`
      : esExamen
        ? `<button id="atras" ${q.indice === 0 ? 'disabled' : ''}>Anterior</button>
           <button id="blanco">Dejar en blanco</button>
           <button class="primario" id="siguiente">${Q.haySiguiente(q) ? 'Siguiente' : 'Terminar'}</button>`
        : `<button class="primario" id="comprobar">Comprobar</button>`

    const nivel = { basica: 'básica', intermedia: 'intermedia', extrema: 'extrema' }[p.difficulty] ?? ''
    const formato = p.formato === 'test' ? 'Elección múltiple' : p.formato === 'corta' ? 'Respuesta corta' : 'Desarrollo'

    render(
      nodo,
      h`<section class="tarjeta">
        <div class="quiz-cabecera">
          <span class="pildora">Lámina ${q.indice + 1} de ${n}</span>
          ${crudo(
            // El cronómetro solo en modo examen. En estudio se sigue midiendo,
            // pero no se enseña: un reloj que se enrojece mientras el alumno
            // piensa, en el modo donde el tiempo no puntúa, solo mete prisa.
            esExamen ? '<span class="cronometro empuja" id="cronometro"></span>' : '<span class="empuja"></span>',
          )}
          <button class="sutil pequeno" id="abandonar">Dejarlo aquí</button>
        </div>

        <div class="barra"><span style="width:${((q.indice + 1) / n) * 100}%"></span></div>

        <div class="lamina" style="margin-top:1.6rem">
          <div class="margen">
            <span class="numero">${q.indice + 1}</span>
            Tema ${p.tema}<br>${formato}${crudo(nivel ? `<br>${esc(nivel)}` : '')}
          </div>
          <div class="cuerpo">
        <p class="enunciado">${p.stem}</p>

        ${crudo(
          p.formato === 'test' ? pintarTest(p, q) : p.formato === 'corta' ? pintarCorta(p, q) : pintarLarga(p, q),
        )}

        ${crudo(revelada && q.modo === Q.MODOS.ESTUDIO ? bloqueExplicacion(p, q.correcciones[p.id]) : '')}

        <div class="fila" style="margin-top:1.5rem">${crudo(acciones)}</div>
        ${crudo(navegador)}
          </div>
        </div>
      </section>`,
    )

    if (revelada && q.modo === Q.MODOS.ESTUDIO) inicioExplicacion = Date.now()
    conectar()
    actualizarCuentaPalabras()
  }

  function actualizarCuentaPalabras() {
    const campo = nodo.querySelector('#resp-corta, #resp-larga')
    const cuenta = nodo.querySelector('#cuenta-palabras')
    if (!campo || !cuenta) return
    const n = campo.value.trim().split(/\s+/).filter(Boolean).length
    cuenta.textContent = n
    const p = Q.preguntaActual(q)
    const limite = p.max_palabras ?? (p.formato === 'corta' ? CONFIG.examen.corta.maxPalabras : CONFIG.examen.larga.maxPalabras)
    cuenta.parentElement.style.color = n > limite ? 'var(--aviso)' : ''
  }

  function guardarTexto() {
    const campo = nodo.querySelector('#resp-corta, #resp-larga')
    if (campo && !campo.disabled) q = Q.responder(q, campo.value)
  }

  function anotarLectura() {
    if (inicioExplicacion) {
      const p = Q.preguntaActual(q)
      if (p) q = Q.anotarLecturaExplicacion(q, p.id, Date.now() - inicioExplicacion)
      inicioExplicacion = null
    }
  }

  function conectar() {
    const campo = nodo.querySelector('#resp-corta, #resp-larga')
    campo?.addEventListener('input', actualizarCuentaPalabras)

    nodo.querySelector('#autoeval')?.addEventListener('change', (e) => {
      const p = Q.preguntaActual(q)
      q = Q.autoevaluarLarga(q, p.id, e.target.value)
    })
  }

  async function avanzar() {
    anotarLectura()
    guardarTexto()
    if (Q.haySiguiente(q)) {
      q = Q.siguiente(q)
      pintar()
    } else {
      await finalizar()
    }
  }

  async function finalizar() {
    clearInterval(cronometro)
    anotarLectura()
    guardarTexto()
    q = Q.terminar(q)
    const res = Q.resultado(q)
    for (const intento of res.intentos) await registrar(intento)
    alTerminar(q, res)
  }

  alPulsar(nodo, '[data-opcion]', (b) => {
    q = Q.responder(q, b.dataset.opcion)
    // En modo estudio, elegir opción corrige en el acto: el beneficio de la
    // práctica de recuperación está en la retroalimentación inmediata.
    if (q.modo === Q.MODOS.ESTUDIO) q = Q.comprobar(q)
    pintar()
  })
  alPulsar(nodo, '#comprobar', () => {
    guardarTexto()
    q = Q.comprobar(q)
    pintar()
  })
  alPulsar(nodo, '#siguiente', avanzar)
  alPulsar(nodo, '#atras', () => {
    guardarTexto()
    q = Q.anterior(q)
    pintar()
  })
  alPulsar(nodo, '#blanco', () => {
    q = Q.dejarEnBlanco(q)
    avanzar()
  })
  alPulsar(nodo, '[data-ir]', (b) => {
    guardarTexto()
    q = Q.irA(q, Number(b.dataset.ir))
    pintar()
  })
  alPulsar(nodo, '#abandonar', async () => {
    if (confirm('¿Salir de la tanda? Se guardará lo que llevas respondido.')) await finalizar()
  })
  alPulsar(nodo, '[data-errata]', async (b) => {
    const motivo = prompt(
      'Cuéntanos qué falla en esta pregunta (error clínico, ambigüedad, fuente incorrecta, errata…):',
    )
    if (!motivo?.trim()) return
    try {
      await (await db()).reportarErrata({ pregunta_id: b.dataset.errata, motivo: 'otro', texto: motivo.trim() })
      b.textContent = 'Aviso enviado, gracias'
      b.disabled = true
    } catch (e) {
      alert('No se pudo enviar el aviso: ' + e.message)
    }
  })

  // Cronómetro: en estudio cuenta hacia arriba y solo informa; en examen cuenta
  // hacia atrás las dos horas reales. Nunca corta al alumno a mitad de pregunta.
  cronometro = setInterval(() => {
    const c = nodo.querySelector('#cronometro')
    if (!c) return
    if (esExamen) {
      const resta = finExamen - Date.now()
      c.textContent = reloj(resta)
      c.classList.toggle('pasado', resta < 10 * 60000)
      if (resta <= 0) finalizar()
    }
  }, 500)

  pintar()
  return () => clearInterval(cronometro)
}

/** Pantalla de resultado, con el marcador en la escala del examen real. */
export function vistaResultado(destino, q, res, { alVolver, alRepasar }) {
  const m = res.marcador
  const nodo = render(
    destino,
    h`
    <section class="tarjeta">
      <h1>Resultado</h1>
      <div class="rejilla tres" style="margin:1.2rem 0">
        <div class="metrica"><div class="valor">${m.total.toFixed(1)}</div><div class="etiqueta">puntos obtenidos</div></div>
        <div class="metrica"><div class="valor">${m.test.aciertos}/${m.test.n}</div><div class="etiqueta">test acertados</div></div>
        <div class="metrica"><div class="valor">${res.minutos}</div><div class="etiqueta">minutos</div></div>
        <div class="metrica"><div class="valor">${res.segundosMedianosTest ?? '—'}</div><div class="etiqueta">segundos por pregunta</div></div>
      </div>

      ${crudo(
        m.test.n
          ? `<div class="aviso-caja ${m.test.fallos > m.test.enBlanco * 3 ? 'atencion' : ''}">
              <strong>Con las reglas del examen:</strong> ${m.test.aciertos} aciertos (+${m.test.aciertos}),
              ${m.test.fallos} fallos (${(m.test.fallos * CONFIG.examen.test.fallo).toFixed(2)}) y
              ${m.test.enBlanco} en blanco (0) &rarr; <strong>${m.test.brutoTest.toFixed(2)} puntos</strong> en la parte de test.
              ${
                m.test.fallos >= 3
                  ? ` Cada tres fallos te cuestan casi un acierto: cuando dudes entre dos opciones, arriesga; cuando no tengas ni idea, el blanco vale más que el fallo.`
                  : ''
              }
             </div>`
          : '',
      )}

      ${crudo(
        res.proporcionEn45s !== null
          ? `<p style="color:var(--tinta-suave)">Resolviste el <strong>${pct(res.proporcionEn45s)}</strong>
             de las preguntas de test por debajo de los 45 segundos que dura una pregunta en el examen.</p>`
          : '',
      )}

      <div class="fila" style="margin-top:1.2rem">
        <button class="primario" id="volver">Volver al inicio</button>
        <button id="repasar">Repasar las falladas</button>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Repaso pregunta a pregunta</h2>
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>#</th><th>Tema</th><th>Formato</th><th>Resultado</th><th class="num">Tiempo</th></tr></thead>
          <tbody>
            ${crudo(
              q.preguntas
                .map((p, i) => {
                  const c = q.correcciones[p.id] ?? {}
                  const t = q.tiempos[p.id]?.ms
                  const estado =
                    c.formato === 'larga'
                      ? `<span class="pildora">${c.cubiertos ?? 0}/${c.totalElementos ?? 0} elementos</span>`
                      : c.enBlanco
                        ? '<span class="pildora">en blanco</span>'
                        : c.correcto
                          ? '<span class="pildora bien">acierto</span>'
                          : '<span class="pildora mal">fallo</span>'
                  return `<tr><td>${i + 1}</td><td>${p.tema}</td><td>${p.formato}</td><td>${estado}</td>
                    <td class="num">${t ? Math.round(t / 1000) + ' s' : '—'}</td></tr>`
                })
                .join(''),
            )}
          </tbody>
        </table>
      </div>
    </section>`,
  )

  alPulsar(nodo, '#volver', alVolver)
  alPulsar(nodo, '#repasar', () => {
    const falladas = q.preguntas.filter((p) => q.correcciones[p.id]?.correcto === false)
    falladas.length ? alRepasar(falladas) : alVolver()
  })
}
