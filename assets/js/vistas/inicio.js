/**
 * Pantalla de inicio: progreso del alumno y configuración del quiz.
 *
 * Aquí se elige entre los dos modos. Se explica la diferencia con una frase
 * cada uno, porque un alumno que no entiende qué modo ha elegido interpreta mal
 * su propio resultado — y en modo examen el resultado incluye la penalización.
 */
import { h, crudo, render, alPulsar, metrica, diasHasta, esc, nuevaVista } from '../ui.js'
import { CONFIG, FASE_CALIBRACION } from '../config.js'
import { inventario, regimenDificultad } from '../banco.js'
import { db } from '../db.js'
import { resumirUso } from '../telemetria.js'
import { MODOS } from '../quiz.js'

const LONGITUDES = [10, 20, 40, 70]

export async function vistaInicio(destino, { onEmpezar, onSimulacro }) {
  nuevaVista(destino)
  render(destino, h`<div class="vacio">Cargando el banco…</div>`)

  const capa = await db()
  const [temas, intentos, sesiones] = await Promise.all([
    inventario(),
    capa.misIntentos().catch(() => []),
    capa.misSesiones().catch(() => []),
  ])

  const disponibles = temas.filter((t) => t.disponible)
  const uso = resumirUso(intentos, sesiones, disponibles.length)
  const dias = diasHasta(CONFIG.fechaExamen)
  const respondidasPorTema = new Map()
  for (const i of intentos) respondidasPorTema.set(i.tema, (respondidasPorTema.get(i.tema) ?? 0) + 1)

  const reg = regimenDificultad(intentos)
  const ETIQUETA = { facil: 'más asequible', media: 'equilibrado', dificil: 'más exigente' }

  const totalTest = disponibles.reduce((a, t) => a + t.test, 0)
  const totalCorta = disponibles.reduce((a, t) => a + t.corta, 0)
  const totalLarga = disponibles.reduce((a, t) => a + t.larga, 0)

  const nodo = render(
    destino,
    h`
    <section class="tarjeta">
      <div class="lamina">
        <div class="margen">
          ${crudo(
            // Un «0» grande en el margen es la fila de ceros que se quería
            // evitar, solo que en tipografía bonita. Antes de empezar, el
            // margen lleva la extensión del banco, no lo que aún no has hecho.
            uso.preguntasUnicas === 0
              ? `<span class="numero">${disponibles.length}</span>temas<br>disponibles`
              : `<span class="numero">${uso.preguntasUnicas}</span>preguntas<br>trabajadas`,
          )}
        </div>
        <div class="cuerpo">
          ${crudo(
            // El estado inicial ya no es una fila de ceros. Cuatro métricas a
            // cero como primera pantalla es un marcador diciéndote que no has
            // hecho nada; el atlas empieza por el índice, no por la nota.
            uso.preguntasUnicas === 0
              ? `<h1>Empieza por donde quieras</h1>
                 <p>Hay <strong>${totalTest + totalCorta + totalLarga} preguntas</strong> repartidas
                 por los ${disponibles.length} temas del programa. Cada una lleva su explicación:
                 por qué esa opción y por qué no las otras.</p>
                 <p class="ayuda">Si no sabes por dónde, el tema 1 es tan buen sitio como otro.</p>`
              : `<h1>Por dónde vas</h1>
                 <div class="rejilla tres" style="margin:1.3rem 0 .4rem">
                   ${metrica(uso.minutosActivos, 'minutos de práctica')}
                   ${metrica(uso.porcentajeAcierto === null ? '—' : uso.porcentajeAcierto + ' %', 'aciertos')}
                   ${metrica(`${uso.coberturaTemario} de ${disponibles.length}`, 'temas trabajados')}
                 </div>`,
          )}
          <p class="ayuda" style="margin-top:1.2rem">
            El parcial de Digestivo es el
            ${new Date(CONFIG.fechaExamen).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}${crudo(
              dias > 0 ? `, dentro de ${dias} días` : dias === 0 ? ', hoy' : '',
            )}.
          </p>
        </div>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Preparar una tanda</h2>

      <div class="campo">
        <label>Modo</label>
        <div class="rejilla dos" id="modos">
          <button type="button" class="opcion elegida" data-modo="${MODOS.ESTUDIO}">
            <span class="letra">E</span>
            <span>
              <strong>Estudio</strong><br>
              <small style="color:var(--tinta-suave)">Corrige cada pregunta al momento y te
              enseña la explicación antes de pasar a la siguiente. Sin penalización.</small>
            </span>
          </button>
          <button type="button" class="opcion" data-modo="${MODOS.EXAMEN}">
            <span class="letra">X</span>
            <span>
              <strong>Examen</strong><br>
              <small style="color:var(--tinta-suave)">Sin corrección hasta el final, navegación
              libre y penalización de −0,33 por fallo, como el 26 de noviembre.</small>
            </span>
          </button>
        </div>
      </div>

      <div class="campo">
        <label>Formato</label>
        <div class="fila" id="formatos">
          <button type="button" class="pequeno elegido" data-formato="test">Test (${totalTest})</button>
          <button type="button" class="pequeno" data-formato="corta">Cortas (${totalCorta})</button>
          <button type="button" class="pequeno" data-formato="larga">Largas (${totalLarga})</button>
          <button type="button" class="pequeno" data-formato="mixto">Mezcla</button>
        </div>
      </div>

      <div class="campo">
        <label>Número de preguntas</label>
        <div class="fila" id="longitudes">
          ${crudo(
            LONGITUDES.map(
              (n, i) =>
                `<button type="button" class="pequeno${i === 1 ? ' elegido' : ''}" data-n="${n}">${n}</button>`,
            ).join(''),
          )}
        </div>
      </div>

      <div class="campo">
        <label>Dificultad</label>
        <label class="casilla" style="margin-bottom:.4rem">
          <input type="checkbox" id="adaptar" checked>
          <span><strong>Ajustar al nivel que llevo</strong> — el nivel sube o baja según cómo
          vayas, para mantenerte en la banda donde más se aprende.</span>
        </label>
        <div class="aviso-caja info" id="explica-nivel" style="margin-bottom:0">
          ${reg.motivo} Ahora mismo el reparto sería <strong>${ETIQUETA[reg.regimen]}</strong>.
        </div>
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
            temas
              .map((t) => {
                const hechas = respondidasPorTema.get(t.n) ?? 0
                const estado = !t.disponible
                  ? '<span class="pildora">sin preguntas</span>'
                  : `<span class="pildora">${t.test}·${t.corta}·${t.larga}</span>`
                return `<button type="button" class="tema-fila${t.disponible ? '' : ' oculto'}" data-tema="${Number(t.n)}" ${t.disponible ? '' : 'disabled'}>
                  <span class="n">${Number(t.n)}</span>
                  <span class="titulo">${esc(t.titulo)}<small>${esc(t.bloque_nombre)}${hechas ? ` · ${hechas} respondidas` : ''}</small></span>
                  ${estado}
                </button>`
              })
              .join(''),
          )}
        </div>
      </div>

      <div class="fila" style="margin-top:1.2rem">
        <button class="primario" id="empezar">Empezar</button>
        <span id="resumen-seleccion" class="ayuda" style="margin:0"></span>
      </div>
    </section>

    <section class="tarjeta">
      <h2>Simulacro completo</h2>
      <p style="color:var(--tinta-suave)">
        La estructura exacta del examen: 70 preguntas de test con penalización, 15 cortas de
        20 palabras y 5 largas de 350, repartidas por todo el temario. Dos horas.
      </p>
      <button id="simulacro" ${disponibles.length < 5 ? 'disabled' : ''}>Hacer el simulacro</button>
      ${crudo(
        disponibles.length < 5
          ? '<p class="ayuda">Disponible cuando haya preguntas de más temas.</p>'
          : '',
      )}
    </section>`,
  )

  // ------------------------------------------------------------- estado
  let modo = MODOS.ESTUDIO
  let formato = 'test'
  let n = 20
  let adaptar = true
  const elegidos = new Set(disponibles.map((t) => t.n))

  const pintarTemas = () => {
    for (const b of nodo.querySelectorAll('[data-tema]')) {
      const marcado = elegidos.has(Number(b.dataset.tema))
      b.classList.toggle('elegido', marcado)
      // El estado de un filtro no puede vivir solo en el color: aria-pressed es
      // lo unico que oye quien navega con lector de pantalla.
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
        : 'Sin ajustar: recibirás la mezcla equilibrada del banco, con su proporción de preguntas difíciles.'
    }
  }

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
  alPulsar(nodo, '[data-tema]', (b) => {
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
    // Los temas donde el primer intento falla más, y los que aún no ha tocado.
    const stats = new Map()
    for (const i of intentos) {
      if (i.correcto === null) continue
      const s = stats.get(i.tema) ?? { n: 0, mal: 0 }
      stats.set(i.tema, { n: s.n + 1, mal: s.mal + (i.correcto ? 0 : 1) })
    }
    const ordenados = disponibles
      .map((t) => {
        const s = stats.get(t.n)
        return { n: t.n, tasa: s && s.n >= 3 ? s.mal / s.n : 1 }
      })
      .sort((a, b) => b.tasa - a.tasa)
      .slice(0, 6)
    elegidos.clear()
    ordenados.forEach((t) => elegidos.add(t.n))
    pintarTemas()
  })

  alPulsar(nodo, '#empezar', () => onEmpezar({ temas: [...elegidos], formato, n, modo, adaptar }))
  alPulsar(nodo, '#simulacro', () => onSimulacro(disponibles.map((t) => t.n)))

  // La marca inicial se pinta aqui y no en el HTML: si el estado por defecto y
  // la clase escrita a mano se separan, el alumno ve marcado un filtro que no
  // es el que se va a aplicar.
  elegirUno('#modos', nodo.querySelector(`[data-modo="${modo}"]`))
  elegirUno('#formatos', nodo.querySelector(`[data-formato="${formato}"]`))
  elegirUno('#longitudes', nodo.querySelector(`[data-n="${n}"]`))
  pintarTemas()
  pintarNivel()
}
