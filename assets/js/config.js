/**
 * Configuración de la plataforma.
 *
 * Sin claves de Supabase la aplicación arranca en MODO LOCAL: todo funciona
 * contra localStorage, con datos que solo existen en este navegador. Sirve para
 * ver y probar la plataforma sin montar nada. En cuanto se rellenan SUPABASE_URL
 * y SUPABASE_ANON_KEY, la misma aplicación pasa a persistir de verdad.
 *
 * La clave anónima de Supabase es pública por diseño: lo que protege los datos
 * es Row Level Security (supabase/schema.sql), no el secreto de esta cadena.
 */
export const SUPABASE_URL = ''
export const SUPABASE_ANON_KEY = ''

/**
 * Correos con papel de administrador. En Supabase esto es solo la cara visible:
 * el rol de verdad lo asigna el servidor desde la tabla `admins_autorizados`,
 * porque si un cliente pudiera concederse un rol, RLS no protegeria nada.
 */
export const ADMINS = Object.freeze([
  'lozanon57@hotmail.com',   // Pablo Lozano Lominchar
  'luisgbayon@gmail.com',    // Luis González Bayón
])

/**
 * Quien puede abrir la revision del banco: recorrer las 503 preguntas con la
 * clave y la explicacion a la vista, marcar las que hay que repasar y anotar
 * por que. Es la misma lista que ADMINS, pero separada a proposito: revisar el
 * banco y ver el panel de uso son dos permisos distintos y no tienen por que ir
 * juntos cuando se sume alguien mas.
 */
export const REVISORES = Object.freeze([
  'lozanon57@hotmail.com',
  'luisgbayon@gmail.com',
])

/** A donde va el informe de revision cuando se cierra la vuelta al banco. */
export const CORREO_COORDINACION = 'lozanon57@hotmail.com'

/**
 * Dominios de correo admitidos. Vacio = cualquiera, que es lo pedido: basta
 * tener correo para entrar. Para restringirlo a la universidad, poner
 * ['ucm.es'] y la propia pantalla de acceso lo aplica.
 */
export const DOMINIOS_PERMITIDOS = Object.freeze([])

export const CONFIG = Object.freeze({
  asignatura: 'Patología Quirúrgica I · Cirugía General y del Aparato Digestivo',
  curso: '4.º de Medicina · UCM · 2026-27',
  fechaExamen: '2026-11-26',
  inicioCurso: '2026-09-03',
  finClases: '2026-11-18',
  versionConsentimiento: '1.0',

  // Estructura del examen real. Todo el marcador de la plataforma sale de aquí.
  examen: Object.freeze({
    test: Object.freeze({ n: 70, puntos: 70, acierto: 1, fallo: -0.33, blanco: 0, maxBlanco: 14 }),
    corta: Object.freeze({ n: 15, puntos: 15, porPregunta: 1, maxPalabras: 20 }),
    larga: Object.freeze({ n: 5, puntos: 15, porPregunta: 3, maxPalabras: 350 }),
    aprobado: 50,
    minutos: 120,
  }),

  // Objetivo de 45 s por pregunta de test. Se mide, no se impone: cortar al
  // alumno a mitad de una pregunta genera justo la ansiedad que se quiere reducir.
  segundosObjetivo: 45,

  // Corte de inactividad para no contar como estudio una pestaña abierta (anexo 02).
  msInactividad: 120000,
})

/**
 * Dificultad adaptativa.
 *
 * El reparto correcto no es uno fijo para toda la clase: es el que mantiene a
 * CADA alumno en la banda donde la práctica de recuperación rinde. Wilson et al.
 * (Nat Commun 2019) situan el optimo de la tasa de aprendizaje en torno al 85 %
 * de aciertos —derivado para clasificadores por descenso de gradiente, no para
 * alumnos, asi que se toma como referencia y no como ley—, y Heitmann et al.
 * (Front Psychol 2018) mostraron en 200 universitarios que adaptar la secuencia
 * de preguntas al nivel del alumno supera a no adaptarla, con menor carga
 * cognitiva percibida.
 *
 * De ahi la banda 70-85 %: por encima el alumno se aburre y no aprende nada
 * nuevo; por debajo acumula fallos, y el fracaso repetido es justo lo que este
 * proyecto dice querer evitar.
 */
/**
 * Fase de calibración (componente A): la dificultad adaptativa se APAGA.
 *
 * Con selección adaptativa, cada ítem lo responde una submuestra elegida por su
 * propio rendimiento: los difíciles van a quien acierta mucho y los fáciles a
 * quien acierta poco. Eso comprime la dificultad medida hacia el centro y
 * contamina la discriminación, que es justo lo que este estudio quiere estimar.
 *
 * Se vuelve a encender cuando el banco esté calibrado. Hasta entonces, todos
 * reciben la mezcla equilibrada y la exposición de cada ítem depende del azar y
 * del tema elegido, no de lo bien que le vaya al alumno.
 */
export const FASE_CALIBRACION = true

export const ADAPTATIVO = Object.freeze({
  banda: Object.freeze({ min: 0.70, max: 0.85 }),
  ventana: 20,          // ultimas respuestas que se miran
  minimoParaAdaptar: 8, // por debajo de esto no hay senal, se usa la mezcla media

  // Reparto basica / intermedia / extrema en cada regimen.
  mezclas: Object.freeze({
    facil:  Object.freeze({ basica: 0.50, intermedia: 0.45, extrema: 0.05 }),
    media:  Object.freeze({ basica: 0.25, intermedia: 0.55, extrema: 0.20 }),
    dificil: Object.freeze({ basica: 0.10, intermedia: 0.50, extrema: 0.40 }),
  }),
})

export const MODO_LOCAL = !SUPABASE_URL || !SUPABASE_ANON_KEY

/**
 * ¿Están publicados los PDF de las clases junto a la aplicación?
 *
 * En GitHub Pages no: son cientos de megas de material docente ajeno, que
 * además no debe publicarse en abierto. Con esto en false no se muestra
 * referencia de clase alguna: un enlace que da 404, o un nombre de fichero que
 * el alumno no puede abrir, no aportan nada. La procedencia sigue guardada en
 * el banco, que es donde la necesita el blueprint del examen.
 */
export const CLASES_PUBLICADAS = false

/** Cartel de que esto es una demostración, no la plataforma en producción. */
export const DEMOSTRACION = true

/**
 * ¿Está cerrada la revisión docente del banco?
 *
 * Mientras esté en false, el alumno entra, ve la hoja de información y decide,
 * pero no accede a las preguntas. No es una cautela de más: el estudio mide las
 * propiedades de los ítems, y un ítem retirado o corregido a mitad de la
 * recogida ya no tiene una sola dificultad, tiene dos. Abrir antes de cerrar la
 * revisión estropea justamente lo que se quiere medir.
 *
 * Se pone en true cuando el revisor termina las 503, no antes.
 */
export const BANCO_VALIDADO = false
