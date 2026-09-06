/**
 * Panel del profesorado.
 *
 * Lo que se ve aquí depende de si las actas están cerradas, y eso lo decide el
 * servidor, no esta pantalla: mientras siguen abiertas, RLS solo devuelve la
 * vista agregada. Es la garantía que se le prometió al alumno en la hoja de
 * información, y por eso el panel lo dice en voz alta en lugar de disimularlo.
 */
import { h, crudo, render, alPulsar, metrica, fecha, descargarCSV, esc } from '../ui.js'
import { db } from '../db.js'
import { inventario } from '../banco.js'

const ESTADOS_ERRATA = ['abierta', 'en_revision', 'corregida', 'desestimada', 'retirada']

export async function vistaAdmin(destino) {
  render(destino, h`<div class="vacio">Cargando el panel…</div>`)

  const capa = await db()
  const [datos, temas] = await Promise.all([capa.panelAdmin(), inventario()])

  const disponibles = temas.filter((t) => t.disponible)
  const totalPreguntas = temas.reduce((a, t) => a + t.total, 0)
  const sinBanco = temas.filter((t) => !t.disponible)

  const agregado = datos.agregado ?? []
  const intentosTotales = datos.soloLocal
    ? (datos.intentos ?? []).length
    : agregado.reduce((a, f) => a + Number(f.n_intentos ?? 0), 0)
  const alumnosActivos = datos.soloLocal
    ? (datos.perfiles ?? []).length
    : Math.max(0, ...agregado.map((f) => Number(f.n_alumnos ?? 0)), 0)

  const erratasAbiertas = (datos.erratas ?? []).filter((e) => e.estado === 'abierta')
  const psicometria = datos.psicometria ?? []
  const problematicos = psicometria.filter(
    (i) => Number(i.discriminacion_d) < 0.15 && (Number(i.dificultad_p) < 0.2 || Number(i.dificultad_p) > 0.95),
  )

  const nodo = render(
    destino,
    h`
    <section class="tarjeta">
      <div class="fila">
        <h1 style="margin:0">Panel del profesorado</h1>
        <span class="pildora empuja">${datos.soloLocal ? 'modo local' : 'Supabase'}</span>
      </div>

      ${crudo(
        datos.soloLocal
          ? `<div class="aviso-caja atencion" style="margin-top:1rem"><strong>Modo local.</strong>
             Aquí solo se ven los datos de este navegador. Configura Supabase para que el panel
             muestre la clase entera.</div>`
          : datos.actasCerradas
            ? `<div class="aviso-caja atencion" style="margin-top:1rem"><strong>Actas cerradas.</strong>
               Ya tienes acceso a los datos individuales. A partir de aquí, el cruce con las notas
               debe hacerlo el custodio de la clave según el protocolo.</div>`
            : `<div class="aviso-caja info" style="margin-top:1rem"><strong>Actas abiertas.</strong>
               Solo ves datos agregados. El servidor no te devuelve quién ha usado la plataforma
               hasta que las actas estén cerradas — es la garantía que se le dio al alumno, y es
               deliberada.</div>`,
      )}

      <div class="rejilla tres" style="margin-top:1.2rem">
        ${crudo(metrica(totalPreguntas, 'preguntas en el banco'))}
        ${crudo(metrica(`${disponibles.length}/${temas.length}`, 'temas con banco'))}
        ${crudo(metrica(intentosTotales, 'respuestas registradas'))}
        ${crudo(metrica(alumnosActivos, 'alumnos con actividad'))}
      </div>
    </section>

    ${crudo(
      sinBanco.length
        ? `<section class="tarjeta"><h2>Temas sin preguntas</h2>
           <p style="color:var(--tinta-suave)">Estos temas del programa no tienen banco todavía,
           casi siempre porque falta el material docente.</p>
           <ul>${sinBanco.map((t) => `<li><strong>Tema ${t.n}</strong> — ${t.titulo}</li>`).join('')}</ul>
           </section>`
        : '',
    )}

    <section class="tarjeta">
      <div class="fila">
        <h2 style="margin:0">Avisos de error de los alumnos</h2>
        <span class="pildora ${erratasAbiertas.length ? 'aviso' : 'bien'} empuja">
          ${erratasAbiertas.length} abiertos
        </span>
      </div>
      ${crudo(
        (datos.erratas ?? []).length
          ? `<div class="tabla-scroll"><table>
              <thead><tr><th>Fecha</th><th>Pregunta</th><th>Aviso</th><th>Estado</th><th></th></tr></thead>
              <tbody>${(datos.erratas ?? [])
                .map(
                  // esc() en los tres: `texto` y `pregunta_id` los escribe el
                  // alumno. Sin escapar, una errata con <img onerror=...> ejecuta
                  // codigo EN LA SESION DEL PROFESOR, que es la cuenta con todos
                  // los privilegios. Es la via mas corta a los datos de la clase.
                  (e) => `<tr>
                    <td>${esc(fecha(e.creado_en))}</td>
                    <td><code>${esc(e.pregunta_id)}</code></td>
                    <td>${esc((e.texto ?? '').slice(0, 160))}</td>
                    <td><select data-errata="${esc(e.id)}" ${datos.soloLocal ? 'disabled' : ''}>
                      ${ESTADOS_ERRATA.map((s) => `<option${s === e.estado ? ' selected' : ''}>${s}</option>`).join('')}
                    </select></td>
                    <td><button class="pequeno" data-ver="${esc(e.pregunta_id)}">Ver</button></td>
                  </tr>`,
                )
                .join('')}</tbody></table></div>
             <p class="ayuda">Compromiso del protocolo: una pregunta señalada como errónea se retira
             en 48 horas hasta resolverla. Las retiradas se cuentan y se publican.</p>`
          : '<div class="vacio">Ningún aviso todavía.</div>',
      )}
    </section>

    <section class="tarjeta">
      <h2>Uso por tema</h2>
      ${crudo(
        agregado.length
          ? `<div class="tabla-scroll"><table>
              <thead><tr><th class="num">Tema</th><th>Formato</th><th class="num">Respuestas</th>
              <th class="num">Alumnos</th><th class="num">Aciertos</th><th class="num">Segundos</th></tr></thead>
              <tbody>${agregado
                .sort((a, b) => a.tema - b.tema || String(a.formato).localeCompare(b.formato))
                .map(
                  (f) => `<tr><td class="num">${f.tema}</td><td>${f.formato}</td>
                    <td class="num">${f.n_intentos}</td><td class="num">${f.n_alumnos}</td>
                    <td class="num">${f.prop_acierto === null ? '—' : Math.round(f.prop_acierto * 100) + ' %'}</td>
                    <td class="num">${f.segundos_medios ?? '—'}</td></tr>`,
                )
                .join('')}</tbody></table></div>`
          : '<div class="vacio">Sin actividad registrada todavía.</div>',
      )}
    </section>

    <section class="tarjeta">
      <div class="fila">
        <h2 style="margin:0">Análisis de ítems</h2>
        <span class="pildora empuja">${psicometria.length} con datos suficientes</span>
      </div>
      <p style="color:var(--tinta-suave)">
        Dificultad e índice de discriminación, calculados sobre el primer intento de cada alumno.
        Un ítem con discriminación por debajo de 0,15 y dificultad extrema es candidato a revisión
        o retirada — es el criterio preespecificado en el componente A del protocolo.
      </p>
      ${crudo(
        problematicos.length
          ? `<div class="aviso-caja atencion"><strong>${problematicos.length} ítems</strong> cumplen
             el criterio de retirada: ${problematicos.slice(0, 12).map((i) => `<code>${i.pregunta_id}</code>`).join(', ')}${problematicos.length > 12 ? '…' : ''}</div>`
          : '',
      )}
      ${crudo(
        psicometria.length
          ? `<div class="tabla-scroll"><table>
              <thead><tr><th>Ítem</th><th class="num">Tema</th><th class="num">n</th>
              <th class="num">Dificultad</th><th class="num">Discriminación</th></tr></thead>
              <tbody>${psicometria
                .slice()
                .sort((a, b) => a.discriminacion_d - b.discriminacion_d)
                .slice(0, 60)
                .map(
                  (i) => `<tr><td><code>${i.pregunta_id}</code></td><td class="num">${i.tema}</td>
                    <td class="num">${i.n}</td><td class="num">${i.dificultad_p}</td>
                    <td class="num">${i.discriminacion_d}</td></tr>`,
                )
                .join('')}</tbody></table></div>`
          : '<div class="vacio">Hacen falta al menos 10 respuestas por ítem para calcularlo.</div>',
      )}
    </section>

    <section class="tarjeta">
      <h2>Exportar</h2>
      <p style="color:var(--tinta-suave)">
        Ficheros para el análisis. Llevan el seudónimo, nunca el correo ni el nombre.
      </p>
      <div class="fila">
        <button id="exp-uso">Uso por tema (CSV)</button>
        <button id="exp-psico">Análisis de ítems (CSV)</button>
        <button id="exp-erratas">Avisos de error (CSV)</button>
        <button id="exp-banco">Inventario del banco (CSV)</button>
      </div>
    </section>`,
  )

  alPulsar(nodo, '#exp-uso', () => descargarCSV('quaero_uso_por_tema.csv', agregado))
  alPulsar(nodo, '#exp-psico', () => descargarCSV('quaero_items.csv', psicometria))
  alPulsar(nodo, '#exp-erratas', () => descargarCSV('quaero_erratas.csv', datos.erratas ?? []))
  alPulsar(nodo, '#exp-banco', () =>
    descargarCSV(
      'quaero_banco.csv',
      temas.map((t) => ({
        tema: t.n, titulo: t.titulo, bloque: t.bloque_nombre,
        test: t.test, cortas: t.corta, largas: t.larga, total: t.total,
        fuentes: (t.fuentes ?? []).join(' | '),
      })),
    ),
  )

  nodo.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-errata]')
    if (!sel) return
    try {
      await capa.cliente
        ?.from('erratas')
        .update({ estado: sel.value, resuelto_en: new Date().toISOString() })
        .eq('id', sel.dataset.errata)
    } catch (err) {
      alert('No se pudo actualizar: ' + err.message)
    }
  })
}
