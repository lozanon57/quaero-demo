/**
 * Un tema por dentro: sus preguntas, cuáles has hecho y qué contestaste.
 *
 * Es la pantalla que faltaba. Hasta ahora una pregunta respondida desaparecía:
 * se corregía, se explicaba y no se podía volver a ella. Para estudiar eso es
 * justo al revés de lo que hace falta — lo que más enseña de una tanda es
 * releer las que fallaste, y releerlas sabiendo qué contestaste tú.
 */
import { h, crudo, render, alPulsar, esc, nuevaVista } from '../ui.js'
import { cargarTema, cargarTemario } from '../banco.js'
import { db } from '../db.js'
import { MODOS } from '../quiz.js'

const FORMATO = { test: 'Test', corta: 'Corta', larga: 'Desarrollo' }
const POR_TANDA = 10

/** Lo que contestó el alumno, legible. En test, la letra y su texto. */
function respuestaDada(p, intento) {
  const v = intento?.respuesta
  if (intento?.en_blanco || v === null || v === undefined || v === '') return '<em>en blanco</em>'
  if (p.formato === 'test') {
    const o = (p.options ?? []).find((x) => x.id === v)
    return o ? `<strong>${esc(o.id)}.</strong> ${esc(o.text)}` : esc(String(v))
  }
  return esc(String(v))
}

function claveDe(p) {
  if (p.formato === 'test') {
    const o = (p.options ?? []).find((x) => x.id === p.correct_answer)
    return o ? `<strong>${esc(o.id)}.</strong> ${esc(o.text)}` : esc(p.correct_answer ?? '—')
  }
  if (p.formato === 'corta') return esc(p.respuesta_canonica ?? '—')
  return esc(p.respuesta_modelo ?? '—')
}

function filaHecha(p, intento) {
  const ok = intento.correcto === true
  const sinCorregir = intento.correcto === null || intento.correcto === undefined
  const marca = sinCorregir
    ? '<span class="sello">—</span>'
    : ok
      ? '<span class="sello ac">✓</span>'
      : '<span class="sello fa">✕</span>'

  return `<details class="pregunta ${sinCorregir ? '' : ok ? 'acertada' : 'fallada'}">
    <summary>
      ${marca}
      <span class="resumen">${esc(p.stem ?? '')}</span>
      <span class="pildora">${esc(FORMATO[p.formato] ?? p.formato)}</span>
    </summary>
    <div class="detalle">
      <p class="enunciado">${esc(p.stem ?? '')}</p>
      <dl class="cotejo">
        <dt>Contestaste</dt><dd class="${ok ? 'ac' : 'fa'}">${respuestaDada(p, intento)}</dd>
        <dt>${p.formato === 'test' ? 'La respuesta era' : 'Respuesta de referencia'}</dt>
        <dd>${claveDe(p)}</dd>
      </dl>
      <div class="explicacion">
        <h3>Explicación</h3>
        <p>${esc(p.explanation ?? '')}</p>
        ${p.teaching_point ? `<div class="perla">${esc(p.teaching_point)}</div>` : ''}
      </div>
    </div>
  </details>`
}

function filaPendiente(p) {
  return `<li class="pendiente">
    <span class="sello">·</span>
    <span class="resumen">${esc((p.stem ?? '').slice(0, 130))}${(p.stem ?? '').length > 130 ? '…' : ''}</span>
    <span class="pildora">${esc(FORMATO[p.formato] ?? p.formato)}</span>
  </li>`
}

export async function vistaTema(destino, n, { onPracticar, onVolver }) {
  nuevaVista(destino)
  render(destino, h`<div class="vacio">Cargando el tema…</div>`)

  const capa = await db()
  const [preguntas, temario, intentos] = await Promise.all([
    cargarTema(n),
    cargarTemario().catch(() => ({ temas: [] })),
    capa.misIntentos().catch(() => []),
  ])
  const meta = (temario.temas ?? []).find((t) => t.n === n) ?? { n, titulo: `Tema ${n}` }

  // Primer intento de cada pregunta: es el que cuenta y el que se enseña.
  const primeros = new Map()
  for (const i of intentos) if (!primeros.has(i.pregunta_id)) primeros.set(i.pregunta_id, i)

  const hechas = preguntas.filter((p) => primeros.has(p.id))
  const pendientes = preguntas.filter((p) => !primeros.has(p.id))
  const aciertos = hechas.filter((p) => primeros.get(p.id).correcto === true).length
  const fallos = hechas.filter((p) => primeros.get(p.id).correcto === false).length

  const nodo = render(
    destino,
    h`
    <section class="tarjeta">
      <p class="rotulo">Tema ${n} · ${meta.bloque_nombre ?? ''}</p>
      <div class="titular">
        <h1 style="margin:0">${meta.titulo}</h1>
        <button class="sutil pequeno" id="volver">Volver al temario</button>
      </div>

      <div class="cifras" style="margin-top:1.3rem">
        <div class="cifra"><span class="numero">${hechas.length}</span><span>respondidas</span></div>
        <div class="cifra"><span class="numero">${pendientes.length}</span><span>pendientes</span></div>
        <div class="cifra"><span class="numero">${aciertos}<i class="barra-cifra">/</i>${
          aciertos + fallos
        }</span><span>aciertos</span></div>
      </div>

      <div class="fila" style="margin-top:1.4rem">
        <button class="primario" id="practicar" ${pendientes.length ? '' : 'disabled'}>
          ${pendientes.length ? `Practicar ${Math.min(POR_TANDA, pendientes.length)} que faltan` : 'No queda ninguna'}
        </button>
        ${crudo(
          fallos
            ? `<button id="repasar-fallos">Repasar las ${fallos} falladas</button>`
            : '',
        )}
      </div>
    </section>

    <section class="tarjeta">
      <div class="titular">
        <h2>Ya contestadas</h2>
        <span class="ayuda">${hechas.length} de ${preguntas.length} · pulsa una para verla entera</span>
      </div>
      ${crudo(
        hechas.length
          ? `<div class="preguntas">${hechas.map((p) => filaHecha(p, primeros.get(p.id))).join('')}</div>`
          : '<p class="ayuda">Todavía ninguna. En cuanto respondas alguna aparece aquí con tu respuesta y la explicación.</p>',
      )}
    </section>

    ${crudo(
      pendientes.length
        ? `<section class="tarjeta">
             <div class="titular">
               <h2>Sin hacer</h2>
               <span class="ayuda">${pendientes.length} preguntas</span>
             </div>
             <ul class="preguntas sin-hacer">${pendientes.map(filaPendiente).join('')}</ul>
           </section>`
        : '',
    )}`,
  )

  alPulsar(nodo, '#volver', onVolver)
  alPulsar(nodo, '#practicar', () =>
    onPracticar({
      temas: [n],
      formato: 'mixto',
      n: Math.min(POR_TANDA, pendientes.length),
      modo: MODOS.ESTUDIO,
      adaptar: false,
    }),
  )
  alPulsar(nodo, '#repasar-fallos', () =>
    onPracticar({
      preguntas: hechas.filter((p) => primeros.get(p.id).correcto === false),
      temas: [n],
      modo: MODOS.ESTUDIO,
    }),
  )
}
