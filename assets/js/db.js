/**
 * Capa de datos con dos adaptadores intercambiables.
 *
 *   supabaseAdapter — persistencia real, protegida por RLS.
 *   localAdapter    — localStorage, para probar la plataforma sin backend.
 *
 * Toda la aplicación habla con este módulo y con ninguno de los dos directamente.
 * Los objetos que salen de aquí son copias: nadie muta el estado guardado.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY, MODO_LOCAL, ADMINS } from './config.js'

const CLAVE = 'quaero.v1'
const clon = (x) => JSON.parse(JSON.stringify(x))
const uuid = () =>
  crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`

// ------------------------------------------------------------- local
function leerLocal() {
  try {
    // Mezclado con vacio(): un estado guardado antes de que existiera una tabla
    // no puede dejar sin definir esa tabla, o el primer spread la revienta.
    return { ...vacio(), ...(JSON.parse(localStorage.getItem(CLAVE)) ?? {}) }
  } catch {
    return vacio()
  }
}
const vacio = () => ({
  perfil: null,
  consentimiento: null,
  sesiones: [],
  quizzes: [],
  intentos: [],
  erratas: [],
  cuestionarios: [],
  marcas: [],
})

function escribirLocal(estado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado))
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e.message)
  }
}

/** Devuelve un estado nuevo con la fila añadida — nunca muta el anterior. */
function insertarLocal(tabla, fila) {
  const estado = leerLocal()
  const nueva = { id: uuid(), creado_en: new Date().toISOString(), ...fila }
  escribirLocal({ ...estado, [tabla]: [...estado[tabla], nueva] })
  return nueva
}

const localAdapter = {
  modo: 'local',

  async usuarioActual() {
    return leerLocal().perfil
  },

  async registrar({ email }) {
    if (!email?.includes('@')) throw new Error('Introduce un correo válido.')
    const estado = leerLocal()
    const perfil = {
      id: uuid(),
      email,
      seudonimo: `local-${Math.random().toString(16).slice(2, 11)}`,
      rol: ADMINS.includes(email.toLowerCase()) ? 'docente' : 'alumno',
      creado_en: new Date().toISOString(),
    }
    escribirLocal({ ...estado, perfil })
    return perfil
  },

  async salir() {
    escribirLocal(vacio())
  },

  async consentimientoActual() {
    return leerLocal().consentimiento
  },

  async guardarConsentimiento(datos) {
    const estado = leerLocal()
    const c = { decision: 'si', ...datos, aceptado_en: new Date().toISOString(), revocado_en: null }
    escribirLocal({ ...estado, consentimiento: c })
    return c
  },

  async revocarConsentimiento() {
    const estado = leerLocal()
    escribirLocal({ ...estado, consentimiento: null, intentos: [], quizzes: [], cuestionarios: [] })
  },

  async crearSesion(userAgent) {
    return insertarLocal('sesiones', { inicio: new Date().toISOString(), ms_activos: 0, user_agent: userAgent })
  },

  async cerrarSesion(id, msActivos) {
    const estado = leerLocal()
    const sesiones = estado.sesiones.map((s) =>
      s.id === id ? { ...s, fin: new Date().toISOString(), ms_activos: msActivos } : s,
    )
    escribirLocal({ ...estado, sesiones })
  },

  async crearQuiz(q) {
    return insertarLocal('quizzes', { ...q, iniciado_en: new Date().toISOString() })
  },

  async cerrarQuiz(id, { puntuacion, puntuacion_max }) {
    const estado = leerLocal()
    const quizzes = estado.quizzes.map((q) =>
      q.id === id ? { ...q, finalizado_en: new Date().toISOString(), puntuacion, puntuacion_max } : q,
    )
    escribirLocal({ ...estado, quizzes })
  },

  async guardarIntento(intento) {
    return insertarLocal('intentos', intento)
  },

  async misIntentos() {
    return clon(leerLocal().intentos)
  },

  async misQuizzes() {
    return clon(leerLocal().quizzes)
  },

  async misSesiones() {
    return clon(leerLocal().sesiones)
  },

  async reportarErrata(e) {
    return insertarLocal('erratas', { ...e, estado: 'abierta' })
  },

  // Una marca por pregunta y revisor: volver sobre una pregunta corrige el
  // dictamen anterior en lugar de acumular dos opiniones contradictorias.
  async guardarMarca(m) {
    const estado = leerLocal()
    const resto = estado.marcas.filter((x) => x.pregunta_id !== m.pregunta_id)
    const fila = { id: uuid(), creado_en: new Date().toISOString(), ...m }
    escribirLocal({ ...estado, marcas: [...resto, fila] })
    return fila
  },

  async misMarcas() {
    return clon(leerLocal().marcas)
  },

  async guardarCuestionario(c) {
    const estado = leerLocal()
    const resto = estado.cuestionarios.filter((x) => x.tipo !== c.tipo)
    const fila = { id: uuid(), creado_en: new Date().toISOString(), ...c }
    escribirLocal({ ...estado, cuestionarios: [...resto, fila] })
    return fila
  },

  async misCuestionarios() {
    return clon(leerLocal().cuestionarios)
  },

  // El panel de administración en modo local solo puede enseñar este navegador.
  async panelAdmin() {
    const e = leerLocal()
    return { soloLocal: true, perfiles: e.perfil ? [e.perfil] : [], intentos: clon(e.intentos), erratas: clon(e.erratas) }
  },
}

// ---------------------------------------------------------- supabase
async function crearClienteSupabase() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

function supabaseAdapter(sb) {
  const uid = async () => (await sb.auth.getUser()).data.user?.id ?? null
  const lanzar = ({ data, error }) => {
    if (error) throw new Error(error.message)
    return data
  }

  return {
    modo: 'supabase',
    cliente: sb,

    async usuarioActual() {
      const id = await uid()
      if (!id) return null
      return lanzar(await sb.from('perfiles').select('*').eq('id', id).single())
    },

    async registrar({ email }) {
      // Enlace mágico: sin contraseñas que gestionar ni que perder.
      lanzar(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } }))
      return { pendienteEmail: true }
    },

    async salir() {
      await sb.auth.signOut()
    },

    async consentimientoActual() {
      const id = await uid()
      const { data } = await sb
        .from('consentimientos').select('*').eq('perfil_id', id).is('revocado_en', null)
        .order('aceptado_en', { ascending: false }).limit(1)
      return data?.[0] ?? null
    },

    async guardarConsentimiento(datos) {
      const perfil_id = await uid()
      // upsert, no insert: la tabla tiene unique(perfil_id, version) y con un
      // insert quien revocaba y volvia a consentir chocaba con su propia fila,
      // se quedaba sin consentimiento vigente y sin poder crear otro — atrapado
      // fuera de la plataforma. Retirarse no puede costar el acceso.
      return lanzar(
        await sb
          .from('consentimientos')
          .upsert({ ...datos, perfil_id, revocado_en: null }, { onConflict: 'perfil_id,version' })
          .select()
          .single(),
      )
    },

    async revocarConsentimiento() {
      const perfil_id = await uid()
      lanzar(
        await sb
          .from('consentimientos')
          .update({ revocado_en: new Date().toISOString() })
          .eq('perfil_id', perfil_id)
          .is('revocado_en', null),
      )
    },

    async crearSesion(user_agent) {
      const perfil_id = await uid()
      return lanzar(await sb.from('sesiones').insert({ perfil_id, user_agent }).select().single())
    },

    async cerrarSesion(id, ms_activos) {
      await sb.from('sesiones').update({ fin: new Date().toISOString(), ms_activos }).eq('id', id)
    },

    async crearQuiz(q) {
      const perfil_id = await uid()
      return lanzar(await sb.from('quizzes').insert({ ...q, perfil_id }).select().single())
    },

    async cerrarQuiz(id, campos) {
      await sb.from('quizzes').update({ finalizado_en: new Date().toISOString(), ...campos }).eq('id', id)
    },

    async guardarIntento(intento) {
      const perfil_id = await uid()
      return lanzar(await sb.from('intentos').insert({ ...intento, perfil_id }).select().single())
    },

    async misIntentos() {
      const id = await uid()
      return lanzar(await sb.from('intentos').select('*').eq('perfil_id', id)) ?? []
    },

    async misQuizzes() {
      const id = await uid()
      return lanzar(await sb.from('quizzes').select('*').eq('perfil_id', id)) ?? []
    },

    async misSesiones() {
      const id = await uid()
      return lanzar(await sb.from('sesiones').select('*').eq('perfil_id', id)) ?? []
    },

    async reportarErrata(e) {
      const perfil_id = await uid()
      return lanzar(await sb.from('erratas').insert({ ...e, perfil_id }).select().single())
    },

    async guardarCuestionario(c) {
      const perfil_id = await uid()
      return lanzar(
        await sb.from('cuestionarios').upsert({ ...c, perfil_id }, { onConflict: 'perfil_id,tipo' }).select().single(),
      )
    },

    async misCuestionarios() {
      const id = await uid()
      return lanzar(await sb.from('cuestionarios').select('*').eq('perfil_id', id)) ?? []
    },

    async guardarMarca(m) {
      const perfil_id = await uid()
      return lanzar(
        await sb
          .from('marcas_revision')
          .upsert({ ...m, perfil_id }, { onConflict: 'perfil_id,pregunta_id' })
          .select()
          .single(),
      )
    },

    async misMarcas() {
      const id = await uid()
      return lanzar(await sb.from('marcas_revision').select('*').eq('perfil_id', id)) ?? []
    },

    /**
     * Mientras las actas siguen abiertas, RLS solo deja pasar la vista agregada.
     * No es una limitación de la interfaz: es la política del servidor, y es
     * deliberada — el profesor no puede ver quién usa la plataforma antes de
     * poner las notas.
     */
    async panelAdmin() {
      // Por funcion con comprobacion de rol en el servidor: las vistas ya no
      // estan concedidas a `authenticated` (un alumno podia leerlas).
      const [agregado, psicometria, erratas, perfiles] = await Promise.all([
        sb.rpc('uso_agregado_para_docencia'),
        sb.rpc('psicometria_para_docencia'),
        sb.from('erratas').select('*').order('creado_en', { ascending: false }),
        sb.from('perfiles').select('id,seudonimo,grupo,creado_en,ultimo_acceso'),
      ])
      return {
        soloLocal: false,
        agregado: agregado.data ?? [],
        psicometria: psicometria.data ?? [],
        erratas: erratas.data ?? [],
        perfiles: perfiles.data ?? [],
        actasCerradas: !perfiles.error && (perfiles.data?.length ?? 0) > 0,
      }
    },
  }
}

let instancia = null

/** Devuelve el adaptador activo. Se resuelve una sola vez por carga. */
export async function db() {
  if (instancia) return instancia
  if (MODO_LOCAL) {
    instancia = localAdapter
  } else {
    try {
      instancia = supabaseAdapter(await crearClienteSupabase())
    } catch (e) {
      console.error('Supabase no disponible, se usa modo local:', e.message)
      instancia = localAdapter
    }
  }
  return instancia
}
