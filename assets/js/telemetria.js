/**
 * Registro de uso, con las definiciones operativas del anexo 02 del protocolo.
 *
 * Regla de honestidad en la medición: el tiempo se cuenta con corte de
 * inactividad a los 120 s. Sin ese corte, una pestaña abierta toda la tarde se
 * contabilizaría como estudio, y el dato de "minutos en la aplicación" dejaría
 * de significar nada.
 *
 * Nada se registra si el alumno no ha consentido la telemetría. Puede usar la
 * plataforma entera sin participar en el estudio: son dos cosas distintas.
 */
import { CONFIG } from './config.js'
import { db } from './db.js'

const EVENTOS = ['pointerdown', 'keydown', 'scroll', 'touchstart']

class Telemetria {
  #sesion = null
  #msActivos = 0
  #ultimoLatido = 0
  #activa = false
  #consiente = false
  #temporizador = null

  get sesionId() {
    return this.#sesion?.id ?? null
  }

  get minutosActivos() {
    return Math.round(this.#msActivos / 60000)
  }

  async iniciar(consiente) {
    this.#consiente = !!consiente
    if (!this.#consiente || this.#sesion) return

    try {
      this.#sesion = await (await db()).crearSesion(navigator.userAgent)
    } catch (e) {
      console.warn('No se pudo abrir la sesión de telemetría:', e.message)
      return
    }

    this.#ultimoLatido = Date.now()
    this.#activa = true
    for (const ev of EVENTOS) addEventListener(ev, this.#marcarActividad, { passive: true })
    document.addEventListener('visibilitychange', this.#cambioVisibilidad)
    addEventListener('pagehide', this.#cerrar)
    // Un latido por segundo: acumula solo mientras hubo actividad reciente.
    this.#temporizador = setInterval(this.#latir, 1000)
  }

  #marcarActividad = () => {
    if (!this.#activa) {
      this.#activa = true
      this.#ultimoLatido = Date.now()
    }
    this.ultimaInteraccion = Date.now()
  }

  #latir = () => {
    const ahora = Date.now()
    const inactivo = ahora - (this.ultimaInteraccion ?? this.#ultimoLatido)
    if (document.hidden || inactivo > CONFIG.msInactividad) {
      this.#activa = false
      this.#ultimoLatido = ahora
      return
    }
    if (this.#activa) this.#msActivos += ahora - this.#ultimoLatido
    this.#ultimoLatido = ahora
  }

  #cambioVisibilidad = () => {
    if (document.hidden) {
      this.#activa = false
    } else {
      this.#activa = true
      this.#ultimoLatido = Date.now()
      this.ultimaInteraccion = Date.now()
    }
  }

  #cerrar = async () => {
    if (!this.#sesion) return
    clearInterval(this.#temporizador)
    try {
      await (await db()).cerrarSesion(this.#sesion.id, this.#msActivos)
    } catch {
      /* la página se está cerrando: no hay a quién avisar */
    }
    this.#sesion = null
  }

  async registrarIntento(intento) {
    if (!this.#consiente) return null
    try {
      return await (await db()).guardarIntento({ ...intento, quiz_id: intento.quiz_id ?? null })
    } catch (e) {
      console.warn('No se pudo registrar el intento:', e.message)
      return null
    }
  }

  async terminar() {
    await this.#cerrar()
  }
}

export const telemetria = new Telemetria()

/**
 * Métricas del alumno, las mismas que el protocolo declara como variables de
 * exposición: preguntas únicas, minutos activos, días activos, espaciamiento,
 * cobertura del temario y proporción de explicaciones leídas.
 */
export function resumirUso(intentos, sesiones, nTemas) {
  const unicas = new Set(intentos.map((i) => i.pregunta_id))
  const dias = new Set(intentos.map((i) => (i.creado_en ?? '').slice(0, 10)).filter(Boolean))
  const msActivos = sesiones.reduce((a, s) => a + (s.ms_activos ?? 0), 0)

  const porTema = new Map()
  for (const i of intentos) porTema.set(i.tema, (porTema.get(i.tema) ?? 0) + 1)
  const cobertura = [...porTema.values()].filter((n) => n >= 10).length

  const primeros = new Map()
  for (const i of intentos) if (!primeros.has(i.pregunta_id)) primeros.set(i.pregunta_id, i)
  const conPrimero = [...primeros.values()]
  const evaluables = conPrimero.filter((i) => i.correcto !== null && !i.en_blanco)

  const inicio = intentos.length
    ? new Date(intentos.reduce((a, i) => (i.creado_en < a ? i.creado_en : a), intentos[0].creado_en))
    : null
  const diasDisponibles = inicio ? Math.max(1, Math.ceil((Date.now() - inicio) / 86400000)) : 1

  const explicacionesLeidas = intentos.filter((i) => (i.ms_explicacion ?? 0) >= 10000).length

  return {
    preguntasUnicas: unicas.size,
    intentosTotales: intentos.length,
    minutosActivos: Math.round(msActivos / 60000),
    diasActivos: dias.size,
    indiceEspaciamiento: +(dias.size / diasDisponibles).toFixed(2),
    coberturaTemario: cobertura,
    nTemas,
    porcentajeAcierto: evaluables.length
      ? Math.round((evaluables.filter((i) => i.correcto).length / evaluables.length) * 100)
      : null,
    porcentajeExplicaciones: intentos.length
      ? Math.round((explicacionesLeidas / intentos.length) * 100)
      : 0,
  }
}
