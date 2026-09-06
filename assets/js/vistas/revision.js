/**
 * Revisión del banco por un docente.
 *
 * No es un quiz: aquí la clave y la explicación están a la vista desde el
 * principio, porque lo que se juzga es la pregunta, no a quien la lee. Se
 * recorre el banco entero, se da por buena o se señala para repasar con una
 * nota, y al final se genera el documento que revisan los dos autores.
 *
 * El dictamen se guarda en cuanto se pulsa. Quinientas tres preguntas no se
 * revisan de una sentada, y perder media tarde por cerrar una pestaña sería
 * motivo suficiente para no volver a abrirla.
 */
import { h, crudo, render, alPulsar, esc, nuevaVista, descargarTexto } from '../ui.js'
import { CORREO_COORDINACION, MODO_LOCAL } from '../config.js'
import { cargarIndice, cargarTemas } from '../banco.js'
import { db } from '../db.js'
import { construirInforme, cuerpoCorreo } from '../revision/informe.js'

const FORMATO = { test: 'Elección múltiple', corta: 'Respuesta corta', larga: 'Desarrollo' }

/** «las 1 preguntas» se lee fatal, y este texto lo ve un catedratico. */
const senaladasTxt = (n) =>
  n === 1 ? 'la única pregunta que has señalado' : `las ${n} preguntas que has señalado`
const conformesTxt = (n) =>
  n === 1
    ? 'el identificador de la única que has dado por buena'
    : `los identificadores de las ${n} que has dado por buenas`

/** Todas las preguntas del banco en orden de tema y de identificador. */
async function cargarBancoEntero() {
  const { temas } = await cargarIndice()
  const numeros = temas.map((t) => t.n).sort((a, b) => a - b)
  const todas = await cargarTemas(numeros)
  return todas.sort((a, b) => a.tema - b.tema || String(a.id).localeCompare(String(b.id)))
}

function pintarClave(p) {
  if (p.formato === 'test') {
    return `<div class="opciones">${(p.options ?? [])
      .map(
        (o) =>
          `<div class="opcion ${o.id === p.correct_answer ? 'correcta' : ''}">
             <span class="letra">${esc(o.id)}</span><span>${esc(o.text)}</span></div>`,
      )
      .join('')}</div>`
  }
  if (p.formato === 'corta') {
    const otras = p.aceptadas?.length
      ? `<p class="ayuda">También se aceptan: ${esc(p.aceptadas.join('; '))}</p>`
      : ''
    return `<div class="perla"><strong>Respuesta canónica.</strong> ${esc(p.respuesta_canonica ?? '—')}</div>${otras}`
  }
  const rubrica = p.rubrica?.length
    ? `<table class="rubrica"><thead><tr><th>Elemento</th><th>Puntos</th></tr></thead><tbody>${p.rubrica
        .map((r) => `<tr><td>${esc(r.elemento)}</td><td>${esc(r.puntos)}</td></tr>`)
        .join('')}</tbody></table>`
    : ''
  return `<div class="perla"><strong>Respuesta modelo.</strong> ${esc(p.respuesta_modelo ?? '—')}</div>${rubrica}`
}

export async function vistaRevision(destino) {
  nuevaVista(destino)
  render(destino, h`<div class="vacio">Cargando el banco entero…</div>`)

  const capa = await db()
  const [preguntas, marcasIniciales] = await Promise.all([cargarBancoEntero(), capa.misMarcas().catch(() => [])])
  const perfil = await capa.usuarioActual()

  if (!preguntas.length) {
    render(destino, h`<div class="tarjeta"><h1>No hay banco que revisar</h1></div>`)
    return
  }

  let marcas = new Map(marcasIniciales.map((m) => [m.pregunta_id, m]))
  // Se empieza donde se dejó: la primera sin dictamen.
  let i = Math.max(0, preguntas.findIndex((p) => !marcas.has(p.id)))
  if (i === -1) i = 0

  const nodo = render(destino, h`<div></div>`)

  const decididas = () => marcas.size
  const senaladas = () => [...marcas.values()].filter((m) => m.estado === 'revisar').length

  function pintar() {
    const p = preguntas[i]
    const m = marcas.get(p.id)
    const hechas = decididas()

    render(
      nodo,
      h`
      <section class="tarjeta">
        <div class="quiz-cabecera">
          <span class="pildora">${hechas} de ${preguntas.length} revisadas · ${senaladas()} señaladas</span>
          <button class="sutil pequeno" id="informe">Generar el documento</button>
        </div>

        <div class="lamina">
          <div class="margen">
            ${crudo(
              `<span class="numero">${i + 1}</span>${esc(p.id)}<br>Tema ${Number(p.tema)}<br>${esc(
                FORMATO[p.formato] ?? p.formato,
              )}<br>${esc(p.difficulty ?? '')}`,
            )}
          </div>
          <div class="cuerpo">
            <p class="enunciado">${p.stem}</p>
            ${crudo(pintarClave(p))}
            <div class="explicacion">
              <h3>Explicación</h3>
              <p>${p.explanation ?? ''}</p>
              ${crudo(p.teaching_point ? `<div class="perla">${esc(p.teaching_point)}</div>` : '')}
              ${crudo(
                [p.guideline_ref, p.trial_ref]
                  .filter(Boolean)
                  .map((f) => `<span class="pildora">${esc(f)}</span>`)
                  .join(' '),
              )}
            </div>

            <div class="campo" style="margin-top:1.4rem">
              <label for="nota">Qué habría que repasar</label>
              <textarea id="nota" rows="3" placeholder="Opcional. Lo que escribas aquí sale en el documento."
                style="min-height:5rem">${m?.nota ?? ''}</textarea>
            </div>

            <div class="fila">
              <button class="primario" id="ok">Correcta</button>
              <button id="revisar">Señalar para repasar</button>
              <span class="ayuda" style="margin:0" id="dictamen">${
                m ? (m.estado === 'revisar' ? 'Señalada para repasar.' : 'Dada por buena.') : 'Sin dictamen todavía.'
              }</span>
            </div>

            <div class="fila" style="margin-top:1.4rem">
              <button class="sutil pequeno" id="anterior" ${i === 0 ? 'disabled' : ''}>Anterior</button>
              <button class="sutil pequeno" id="siguiente" ${
                i === preguntas.length - 1 ? 'disabled' : ''
              }>Siguiente</button>
              <button class="sutil pequeno" id="pendiente">Ir a la primera sin revisar</button>
            </div>
          </div>
        </div>
      </section>`,
    )
  }

  async function decidir(estado) {
    const p = preguntas[i]
    const nota = nodo.querySelector('#nota')?.value ?? ''
    const fila = await capa.guardarMarca({
      pregunta_id: p.id,
      tema: p.tema,
      formato: p.formato,
      estado,
      nota,
    })
    // Mapa nuevo, no mutación del anterior: el estado de la vista se sustituye.
    marcas = new Map([...marcas, [p.id, { ...fila, pregunta_id: p.id, estado, nota }]])
    if (i < preguntas.length - 1) i += 1
    pintar()
  }

  function generarInforme() {
    const informe = construirInforme(preguntas, [...marcas.values()], perfil?.email ?? 'revisor')
    descargarTexto(informe.nombre, informe.md)
    const asunto = encodeURIComponent(`QUAERO · revisión del banco (${informe.resumen.senaladas} señaladas)`)
    const cuerpo = encodeURIComponent(cuerpoCorreo(informe.resumen, informe.nombre, perfil?.email ?? 'revisor'))
    render(
      nodo,
      h`
      <section class="tarjeta">
        <h1>Documento generado</h1>
        <p>Se acaba de descargar <strong>${informe.nombre}</strong>. Contiene
        ${senaladasTxt(informe.resumen.senaladas)} con su enunciado, su clave, su explicación y tu
        nota, y un anexo con ${conformesTxt(informe.resumen.conformes)}.</p>
        ${crudo(
          informe.resumen.sinVer
            ? `<div class="aviso-caja atencion"><strong>Quedan ${informe.resumen.sinVer} sin dictamen.</strong>
               No salen en el documento. Puedes volver, terminarlas y generarlo otra vez.</div>`
            : '',
        )}
        ${crudo(
          MODO_LOCAL
            ? `<div class="aviso-caja info">Esta versión no tiene servidor, así que el correo no
               puede salir solo. El botón de abajo abre tu programa de correo con el mensaje
               escrito; el fichero descargado hay que adjuntarlo a mano.</div>`
            : '',
        )}
        <div class="fila" style="margin-top:1.2rem">
          <a class="boton primario" href="mailto:${CORREO_COORDINACION}?subject=${asunto}&body=${cuerpo}">
            Escribir el correo a Pablo</a>
          <button class="sutil pequeno" id="volver-revision">Seguir revisando</button>
        </div>
      </section>`,
    )
  }

  alPulsar(nodo, '#ok', () => decidir('ok'))
  alPulsar(nodo, '#revisar', () => decidir('revisar'))
  alPulsar(nodo, '#anterior', () => {
    i = Math.max(0, i - 1)
    pintar()
  })
  alPulsar(nodo, '#siguiente', () => {
    i = Math.min(preguntas.length - 1, i + 1)
    pintar()
  })
  alPulsar(nodo, '#pendiente', () => {
    const j = preguntas.findIndex((p) => !marcas.has(p.id))
    i = j === -1 ? i : j
    pintar()
  })
  alPulsar(nodo, '#informe', generarInforme)
  alPulsar(nodo, '#volver-revision', pintar)

  pintar()
}
