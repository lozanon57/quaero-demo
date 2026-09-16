/**
 * Pantalla de inicio: el temario, y dentro de él lo que llevas.
 *
 * El eje es el tema, no el formato ni la dificultad. Un alumno de cuarto no
 * estudia «cuarenta preguntas de test»: estudia páncreas. Por eso lo primero
 * que se ve es el índice de los treinta temas con su cuenta, y las opciones
 * finas quedan plegadas para quien las quiera.
 *
 * Las cuentas se pintan hacia lo que queda, no hacia lo que falta por hacer:
 * «12 de 17» y una regla que se llena, no un marcador en rojo. El objetivo
 * declarado del proyecto es reducir la ansiedad, y eso empieza por cómo se
 * enseña el propio progreso.
 */
import { h, crudo, render, alPulsar, diasHasta, esc, nuevaVista } from '../ui.js'
import { CONFIG, FASE_CALIBRACION } from '../config.js'
import { inventario, regimenDificultad } from '../banco.js'
import { db } from '../db.js'
import { progresoPorTema, progresoGlobal } from '../progreso.js'
import { MODOS } from '../quiz.js'

const LONGITUDES = [10, 20, 40, 70]

const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)} %`)
const dosCifras = (n) => String(n).padStart(2, '0')

/** Regla de avance. Un filete que se llena, no una barra de videojuego. */
function regla(proporcion, etiqueta = '') {
  const ancho = Math.max(0, Math.min(1, proporcion)) * 100
  return `<div class="regla" role="img" aria-label="${esc(etiqueta)}">
            <i style="width:${ancho.toFixed(1)}%"></i>
          </div>`
}

function filaTema(t) {
  // Un tema sin empezar no enseña un cero: enseña cuánto hay. Un «0/17» en
  // negrita es exactamente el marcador de pérdida que se quería quitar.
  const estado = !t.disponible
    ? '<span class="pildora">sin preguntas</span>'
    : t.pendientes === 0
      ? '<span class="pildora hecho">completo</span>'
      : t.hechas === 0
        ? `<span class="cuenta suave">${t.total} preguntas</span>`
        : `<span class="cuenta"><b>${t.hechas}</b><i>/${t.total}</i></span>`

  const marcas =
    t.aciertos + t.fallos > 0
      ? `<span class="marcas"><span class="ac">${t.aciertos}</span><span class="fa">${t.fallos}</span></span>`
      : '<span class="marcas vacia"></span>'

  return `<li>
    <button type="button" class="tema" data-tema="${Number(t.n)}" ${t.disponible ? '' : 'disabled'}>
      <span class="n">${dosCifras(t.n)}</span>
      <span class="titulo">${esc(t.titulo)}<small>${esc(t.bloque_nombre ?? '')}</small></span>
      ${marcas}
      ${estado}
      ${regla(t.total ? t.hechas / t.total : 0, `${t.hechas} de ${t.total} respondidas`)}
    </button>
  </li>`
}

export async function vistaInicio(destino, { onEmpezar, onSimulacro }) {
  nuevaVista(destino)
  render(destino, h`<div class="vacio">Cargando el temario…</div>`)

  const capa = await db()
  const [temas, intentos] = await Promise.all([inventario(), capa.misIntentos().catch(() => [])])

  const filas = progresoPorTema(temas, intentos)
  const disponibles = filas.filter((t) => t.disponible)
  const g = progresoGlobal(disponibles)
  const dias = diasHasta(CONFIG.fechaExamen)

  const reg = regimenDificultad(intentos)
  const ETIQUETA = { facil: 'más asequible', media: 'equilibrado', dificil: 'más exigente' }

  const totalTest = disponibles.reduce((a, t) => a + t.test, 0)
  const totalCorta = disponibles.reduce((a, t) => a + t.corta, 0)
  const totalLarga = disponibles.reduce((a, t) => a + t.larga, 0)

  const empezado = g.hechas > 0

  const nodo = render(
    destino,
    h`
    <section class="tarjeta portada">
      <p class="rotulo">${empezado ? 'Por dónde vas' : 'Patología Quirúrgica I'}</p>
      ${crudo(
        empezado
          ? `<div class="cifras">
               <div class="cifra"><span class="numero">${g.hechas}</span><span>respondidas</span></div>
               <div class="cifra"><span class="numero">${g.pendientes}</span><span>pendientes</span></div>
               <div class="cifra"><span class="numero">${pct(g.acierto)}</span><span>aciertos</span></div>
             </div>
             ${regla(g.avance, `${g.hechas} de ${g.total} preguntas`)}
             <p class="ayuda">${g.aciertos} acertadas y ${g.fallos} falladas de las
             ${g.aciertos + g.fallos} corregidas · ${g.temasEmpezados} de
             ${disponibles.length} temas empezados${
               g.temasTerminados ? `, ${g.temasTerminados} completos` : ''
             }.</p>`
          : `<h1>Empieza por donde quieras</h1>
             <p>Hay <strong>${g.total} preguntas</strong> repartidas por los
             ${disponibles.length} temas del programa. Cada una lleva su explicación: por qué esa
             opción y por qué no las otras.</p>
             <p class="ayuda">Si no sabes por dónde, el tema 1 es tan buen sitio como otro.</p>`,
      )}
    </section>

    <section class="tarjeta">
      <div class="titular">
        <h2>El temario</h2>
        <span class="ayuda">Pulsa un tema para ver sus preguntas y las que ya llevas</span>
      </div>
      <ol class="indice">${crudo(filas.map(filaTema).join(''))}</ol>
    </section>

    <section class="tarjeta">
      <details class="avanzado">
        <summary>Preparar una tanda a medida</summary>

        <div class="campo">
          <label>Modo</label>
          <div class="rejilla dos" id="modos">
            <button type="button" class="opcion elegida" data-modo="${MODOS.ESTUDIO}">
              <span class="letra">E</span>
              <span><strong>Estudio</strong><br>
                <small>Corrige al momento y enseña la explicación antes de pasar. Sin penalización.</small>
              </span>
            </button>
            <button type="button" class="opcion" data-modo="${MODOS.EXAMEN}">
              <span class="letra">X</span>
              <span><strong>Examen</strong><br>
                <small>Sin corrección hasta el final y penalización de −0,33, como el 26 de noviembre.</small>
              </span>
            </button>
          </div>
        </div>

        <div class="campo">
          <label>Formato</label>
          <div class="fila" id="formatos">
            <button type="button" class="pequeno" data-formato="test">Test (${totalTest})</button>
            <button type="button" class="pequeno" data-formato="corta">Cortas (${totalCorta})</button>
            <button type="button" class="pequeno" data-formato="larga">Largas (${totalLarga})</button>
            <button type="button" class="pequeno" data-formato="mixto">Mezcla</button>
          </div>
        </div>

        <div class="campo">
          <label>Número de preguntas</label>
          <div class="fila" id="longitudes">
            ${crudo(
              LONGITUDES.map((n) => `<button type="button" class="pequeno" data-n="${n}">${n}</button>`).join(''),
            )}
          </div>
        </div>

        <div class="campo">
          <label>Dificultad</label>
          <label class="casilla" style="margin-bottom:.4rem">
            <input type="checkbox" id="adaptar" checked>
            <span><strong>Ajustar al nivel que llevo</strong> — el nivel sube o baja según cómo
            vayas, para mantenerte donde más se aprende.</span>
          </label>
          <div class="aviso-caja info" id="explica-nivel" style="margin-bottom:0"></div>
        </div>

        <div class="campo">
          <div class="fila" style="margin-bottom:.5rem">
            <label style="margin:0">Temas</label>
            <button type="button" class="sutil pequeno" id="todos">Todos</button>
            <button type="button" class="sutil pequeno" id="ninguno">Ninguno</button>
            <button type="button" class="sutil pequeno" id="flojos">Donde fallo más</button>
          </div>
          <div class="lista-temas" id="temas">
            ${crudo(
              filas
                .map(
                  (t) => `<button type="button" class="tema-fila${t.disponible ? '' : ' oculto'}"
                      data-tema="${Number(t.n)}" ${t.disponible ? '' : 'disabled'}>
                      <span class="n">${Number(t.n)}</span>
                      <span class="titulo">${esc(t.titulo)}<small>${esc(t.bloque_nombre ?? '')}${
                        t.hechas ? ` · ${t.hechas} respondidas` : ''
                      }</small></span>
                      <span class="pildora">${t.test}·${t.corta}·${t.larga}</span>
                    </button>`,
                )
                .join(''),
            )}
          </div>
        </div>

        <div class="fila" style="margin-top:1.2rem">
          <button class="primario" id="empezar">Empezar</button>
          <span id="resumen-seleccion" class="ayuda" style="margin:0"></span>
        </div>
      </details>
    </section>

    <section class="tarjeta">
      <div class="titular">
        <h2>Simulacro completo</h2>
        <span class="ayuda">Dos horas</span>
      </div>
      <p style="color:var(--tinta-suave)">
        La estructura exacta del examen: 70 preguntas de test con penalización, 15 cortas de
        20 palabras y 5 largas de 350, repartidas por todo el temario.
      </p>
      <button id="simulacro" ${disponibles.length < 5 ? 'disabled' : ''}>Hacer el simulacro</button>
      ${crudo(
        disponibles.length < 5 ? '<p class="ayuda">Disponible cuando haya preguntas de más temas.</p>' : '',
      )}
      <p class="ayuda" style="margin-top:1rem">El examen es el
      ${new Date(CONFIG.fechaExamen).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}${crudo(
        dias > 0 ? `, dentro de ${dias} días` : dias === 0 ? ', hoy' : '',
      )}.</p>
    </section>`,
  )

  // ------------------------------------------------------------- estado
  let modo = MODOS.ESTUDIO
  let formato = 'test'
  let n = 20
  let adaptar = true
  const elegidos = new Set(disponibles.map((t) => t.n))

  const pintarTemas = () => {
    for (const b of nodo.querySelectorAll('#temas [data-tema]')) {
      const marcado = elegidos.has(Number(b.dataset.tema))
      b.classList.toggle('elegido', marcado)
      b.setAttribute('aria-pressed', String(marcado))
    }
    const r = nodo.querySelector('#resumen-seleccion')
    r.textContent = elegidos.size
      ? `${elegidos.size} tema${elegidos.size === 1 ? '' : 's'} seleccionado${elegidos.size === 1 ? '' : 's'}`
      : 'Selecciona al menos un tema'
    nodo.querySelector('#empezar').disabled = elegidos.size === 0
  }

  const elegirUno = (contenedor, activo) => {
    for (const b of nodo.querySelectorAll(`${contenedor} button`)) {
      const marcado = b === activo
      b.classList.toggle(contenedor === '#modos' ? 'elegida' : 'elegido', marcado)
      b.setAttribute('aria-pressed', String(marcado))
    }
  }

  const pintarNivel = () => {
    const caja = nodo.querySelector('#explica-nivel')
    const casilla = nodo.querySelector('#adaptar')
    if (FASE_CALIBRACION) {
      casilla.disabled = true
      casilla.checked = false
      caja.innerHTML =
        'Ahora mismo todos recibís la misma mezcla de dificultad. Estamos midiendo cómo funciona ' +
        'cada pregunta, y para eso hace falta que no dependa de a quién le toca.'
    } else if (modo === MODOS.EXAMEN) {
      casilla.disabled = true
      caja.innerHTML =
        'En modo examen no se ajusta nada: el examen del 26 de noviembre tampoco se ajusta a nadie.'
    } else {
      casilla.disabled = false
      caja.innerHTML = adaptar
        ? `${reg.motivo} Ahora mismo el reparto sería <strong>${ETIQUETA[reg.regimen]}</strong>.`
        : 'Sin ajustar: recibirás la mezcla equilibrada del banco, con su proporción de difíciles.'
    }
  }

  // Un clic en el índice abre el tema: sus preguntas, las que ya contestaste
  // con tu respuesta al lado, y el botón para seguir. Arrancar la tanda
  // directamente escondía justo lo que hay que poder mirar.
  alPulsar(nodo, '.indice .tema', (b) => {
    location.hash = `#/tema/${Number(b.dataset.tema)}`
  })

  alPulsar(nodo, '#modos button', (b) => {
    modo = b.dataset.modo
    elegirUno('#modos', b)
    pintarNivel()
  })
  nodo.querySelector('#adaptar').addEventListener('change', (e) => {
    adaptar = e.target.checked
    pintarNivel()
  })
  alPulsar(nodo, '#formatos button', (b) => {
    formato = b.dataset.formato
    elegirUno('#formatos', b)
  })
  alPulsar(nodo, '#longitudes button', (b) => {
    n = Number(b.dataset.n)
    elegirUno('#longitudes', b)
  })
  alPulsar(nodo, '#temas [data-tema]', (b) => {
    const t = Number(b.dataset.tema)
    elegidos.has(t) ? elegidos.delete(t) : elegidos.add(t)
    pintarTemas()
  })
  alPulsar(nodo, '#todos', () => {
    disponibles.forEach((t) => elegidos.add(t.n))
    pintarTemas()
  })
  alPulsar(nodo, '#ninguno', () => {
    elegidos.clear()
    pintarTemas()
  })
  alPulsar(nodo, '#flojos', () => {
    const ordenados = disponibles
      .map((t) => ({ n: t.n, tasa: t.acierto === null ? 1 : 1 - t.acierto }))
      .sort((a, b) => b.tasa - a.tasa)
      .slice(0, 6)
    elegidos.clear()
    ordenados.forEach((t) => elegidos.add(t.n))
    pintarTemas()
  })

  alPulsar(nodo, '#empezar', () => onEmpezar({ temas: [...elegidos], formato, n, modo, adaptar }))
  alPulsar(nodo, '#simulacro', () => onSimulacro(disponibles.map((t) => t.n)))

  elegirUno('#modos', nodo.querySelector(`[data-modo="${modo}"]`))
  elegirUno('#formatos', nodo.querySelector(`[data-formato="${formato}"]`))
  elegirUno('#longitudes', nodo.querySelector(`[data-n="${n}"]`))
  pintarTemas()
  pintarNivel()
}
