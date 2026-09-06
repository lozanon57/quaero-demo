/**
 * Arranque y navegación.
 *
 * Enrutado por hash, sin dependencias: la aplicación tiene seis pantallas y no
 * necesita más. El estado vivo (quiz en curso) se guarda aquí y se pasa a las
 * vistas; las vistas no se hablan entre ellas.
 */
import { h, crudo, render, alPulsar } from './ui.js'
import { CONFIG, MODO_LOCAL, FASE_CALIBRACION, DEMOSTRACION, REVISORES, BANCO_VALIDADO } from './config.js'
import { db } from './db.js'
import { telemetria } from './telemetria.js'
import { seleccionar, simulacroCompleto, regimenDificultad } from './banco.js'
import { crearQuiz } from './quiz.js'
import { vistaAcceso } from './vistas/acceso.js'
import { vistaConsentimiento } from './vistas/consentimiento.js'
import { vistaCuestionario } from './vistas/cuestionario.js'
import { vistaInicio } from './vistas/inicio.js'
import { vistaQuiz, vistaResultado } from './vistas/quiz-vista.js'
import { vistaAdmin } from './vistas/admin.js'
import { vistaPerfil } from './vistas/perfil.js'
import { vistaRevision } from './vistas/revision.js'

const app = document.querySelector('#app')
const nav = document.querySelector('#nav')

const estado = {
  perfil: null,
  consentimiento: null,
  reofrecerDecision: false,
  quiz: null,
  limpiarQuiz: null,
}

function pintarNav() {
  if (!estado.perfil || !estado.consentimiento || estado.reofrecerDecision) {
    nav.innerHTML = ''
    return
  }
  // El panel solo se enseña a docente y custodio. No es la seguridad — de eso
  // se encarga RLS en el servidor — pero enseñarle a un alumno una puerta que
  // no puede abrir solo genera preguntas.
  const esAdmin = ['docente', 'custodio'].includes(estado.perfil.rol)
  const esRevisor = REVISORES.includes((estado.perfil.email ?? '').toLowerCase())
  render(
    nav,
    h`
    <button class="sutil pequeno" data-ruta="#/">Inicio</button>
    <button class="sutil pequeno" data-ruta="#/perfil">Mi participación</button>
    ${crudo(esAdmin ? '<button class="sutil pequeno" data-ruta="#/panel">Panel</button>' : '')}
    ${crudo(esRevisor ? '<button class="sutil pequeno" data-ruta="#/revision">Revisar el banco</button>' : '')}
    <button class="sutil pequeno" id="salir">Salir</button>`,
  )
}

alPulsar(nav, '[data-ruta]', (b) => {
  location.hash = b.dataset.ruta
})
alPulsar(nav, '#salir', async () => {
  await telemetria.terminar()
  await (await db()).salir()
  location.hash = '#/'
  location.reload()
})

/** Guarda un intento, si el alumno consintió la telemetría. */
const registrar = (intento) => telemetria.registrarIntento({ ...intento, quiz_id: estado.quiz?.id ?? null })

async function lanzarQuiz(preguntas, modo, temas, regimen = null) {
  if (!preguntas.length) {
    alert('No hay preguntas disponibles con esos criterios.')
    return
  }
  let fila = null
  if (estado.consentimiento?.telemetria) {
    try {
      fila = await (await db()).crearQuiz({
        modo,
        formato: [...new Set(preguntas.map((p) => p.formato))].length > 1 ? 'mixto' : preguntas[0].formato,
        temas,
        n_preguntas: preguntas.length,
        sesion_id: telemetria.sesionId,
        // El regimen de dificultad varia entre alumnos: es una co-intervencion
        // y el protocolo exige saber cual recibio cada uno.
        modo_dificultad: regimen,
      })
    } catch (e) {
      console.warn('No se pudo abrir el quiz en la base de datos:', e.message)
    }
  }
  estado.quiz = fila
  estado.limpiarQuiz?.()
  estado.limpiarQuiz = vistaQuiz(app, crearQuiz({ preguntas, modo, temas, quizId: fila?.id ?? null }), {
    registrar,
    alTerminar: async (q, res) => {
      if (fila) {
        try {
          await (await db()).cerrarQuiz(fila.id, {
            puntuacion: res.marcador.total,
            puntuacion_max: preguntas.length,
          })
        } catch { /* el resultado ya se le enseña igual */ }
      }
      vistaResultado(app, q, res, {
        alVolver: () => {
          location.hash = '#/'
          enrutar()
        },
        alRepasar: (falladas) => lanzarQuiz(falladas, modo, temas, regimen),
      })
    },
  })
}

async function pantallaInicio() {
  await vistaInicio(app, {
    onEmpezar: async ({ temas, formato, n, modo, adaptar }) => {
      const intentos = await (await db()).misIntentos().catch(() => [])
      const vistas = new Set(intentos.map((i) => i.pregunta_id))
      // En modo examen no se adapta (el examen real no adapta), y en fase de
      // calibración tampoco: adaptar sesgaría la dificultad que se quiere medir.
      const r = adaptar && modo !== 'examen' && !FASE_CALIBRACION ? regimenDificultad(intentos) : null
      const preguntas = await seleccionar({ temas, formato, n, vistas, regimen: r?.regimen ?? null })
      await lanzarQuiz(preguntas, modo, temas, r?.regimen ?? null)
    },
    onSimulacro: async (temas) => {
      if (!confirm('El simulacro son 90 preguntas y dos horas, con penalización. ¿Empezamos?')) return
      await lanzarQuiz(await simulacroCompleto(temas), 'examen', temas, null)
    },
  })
}

async function enrutar() {
  const ruta = location.hash || '#/'

  if (!estado.perfil) {
    vistaAcceso(app, async () => {
      await arrancar()
    })
    return
  }
  // Puerta única: pronunciarse. Se vuelve a preguntar una sola vez a quien lo
  // aplazó y ya han pasado siete dias; a la segunda, se respeta el silencio.
  if (!estado.consentimiento || estado.reofrecerDecision) {
    await vistaConsentimiento(app, async () => {
      await arrancar()
    })
    return
  }

  // No hay segunda puerta. El componente A necesita respuestas a las preguntas,
  // no covariables del alumno: un cuestionario obligatorio antes de la primera
  // pregunta solo compraria deserción, y además diferencial — se caen antes los
  // que peor van, que son justo la cola que interesa observar.
  // Los cuestionarios se ofrecen desde «Mi participación», sin bloquear nada.

  if (ruta.startsWith('#/perfil')) {
    await vistaPerfil(app, {
      alCambiar: async (opciones) => {
        if (opciones?.abrirCuestionario) {
          vistaCuestionario(app, opciones.abrirCuestionario, {
            indice: 1,
            total: 1,
            alTerminar: async () => {
              location.hash = '#/perfil'
              await enrutar()
            },
          })
          return
        }
        await arrancar()
      },
    })
    return
  }

  // Puerta del banco. El alumno ya ha entrado y ya ha decidido sobre el
  // consentimiento —esas dos cosas no dependen de la revision—, pero no ve una
  // sola pregunta hasta que la revision docente esta cerrada.
  if (!BANCO_VALIDADO && !REVISORES.includes((estado.perfil.email ?? '').toLowerCase())) {
    render(
      app,
      h`<div class="tarjeta" style="max-width:38rem;margin:2rem auto">
        <h1>Todavía no</h1>
        <p>El banco está en revisión por el profesorado. Cada pregunta se está
        leyendo una por una antes de que la veas, y hasta que esa vuelta termine
        no se abre la práctica.</p>
        <p style="color:var(--tinta-suave)">Tu acceso ya está hecho y tu decisión
        sobre el estudio, guardada. No hay que volver a rellenar nada: cuando se
        abra, entras y empiezas.</p>
      </div>`,
    )
    return
  }

  if (ruta.startsWith('#/revision')) {
    // La revision del banco es una lista nominal, no un rol: es quien ha
    // aceptado revisarlo, y hoy son dos personas.
    if (!REVISORES.includes((estado.perfil.email ?? '').toLowerCase())) {
      render(app, h`<div class="tarjeta"><h1>Sin acceso</h1>
        <p>La revisión del banco está abierta solo a quienes la han asumido.</p>
        <button class="primario" data-ruta="#/">Volver</button></div>`)
      alPulsar(app, '[data-ruta]', () => { location.hash = '#/' })
      return
    }
    await vistaRevision(app)
    return
  }

  if (ruta.startsWith('#/panel')) {
    if (!['docente', 'custodio'].includes(estado.perfil.rol)) {
      render(app, h`<div class="tarjeta"><h1>Sin acceso</h1>
        <p>El panel es del profesorado. Si crees que deberías tener acceso, avisa.</p>
        <button class="primario" data-ruta="#/">Volver</button></div>`)
      alPulsar(app, '[data-ruta]', () => { location.hash = '#/' })
      return
    }
    await vistaAdmin(app)
    return
  }
  await pantallaInicio()
}

async function arrancar() {
  try {
    const capa = await db()
    estado.perfil = await capa.usuarioActual()
    estado.consentimiento = estado.perfil ? await capa.consentimientoActual() : null
    const c = estado.consentimiento
    const DIAS = 7 * 86400000
    estado.reofrecerDecision =
      !!c && c.decision === 'aplazada' && !c.reofrecida_en &&
      Date.now() - new Date(c.aceptado_en).getTime() > DIAS
  } catch (e) {
    console.error('Error al arrancar:', e)
    render(
      app,
      h`<div class="tarjeta"><h1>No se pudo cargar la plataforma</h1>
         <p>${e.message}</p>
         <p class="ayuda">Si acabas de configurar Supabase, comprueba la URL y la clave anónima
         en <code>assets/js/config.js</code>.</p></div>`,
    )
    return
  }

  pintarNav()
  pintarBandaDemo()
  if (estado.consentimiento?.telemetria) await telemetria.iniciar(true)
  await enrutar()
}

/** Cartel permanente mientras esto sea una prueba y no la plataforma real. */
function pintarBandaDemo() {
  if (!DEMOSTRACION || document.querySelector('#banda-demo')) return
  const banda = document.createElement('div')
  banda.id = 'banda-demo'
  banda.style.cssText =
    'background:var(--nota-fondo);border-bottom:1px solid var(--filete-fuerte);' +
    'padding:.5rem 1.5rem;font-size:.82rem;color:var(--tinta-media);text-align:center'
  banda.innerHTML =
    '<strong>Versión de prueba.</strong> Los datos se guardan solo en este navegador y ' +
    'no salen de él.'
  document.body.insertBefore(banda, document.body.firstChild)
}

addEventListener('hashchange', enrutar)
arrancar()

if (MODO_LOCAL) {
  console.info(
    `%cQUAERO en modo local%c\nLos datos se guardan solo en este navegador. ` +
      `Rellena SUPABASE_URL y SUPABASE_ANON_KEY en assets/js/config.js para persistir de verdad.\n` +
      `Examen: ${CONFIG.fechaExamen}`,
    'font-weight:bold',
    'font-weight:normal',
  )
}
