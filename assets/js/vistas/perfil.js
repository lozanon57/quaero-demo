/**
 * Mi participación: qué decidió el alumno, y cómo cambiarlo en cualquier dirección.
 *
 * Aquí está el derecho de retirada a un clic, sin diálogos de retención. Y
 * también el camino de vuelta: quien dijo que no o lo aplazó puede sumarse
 * después sin tener que pedírselo a nadie. Un derecho que hay que solicitar por
 * escrito al profesor que te examina no es ejercitable.
 */
import { h, crudo, render, alPulsar, fecha, nuevaVista } from '../ui.js'
import { db } from '../db.js'
import { cargarInstrumentos } from '../cuestionarios.js'

const ETIQUETAS = {
  telemetria: 'Registro de mis respuestas para estudiar la calidad del banco',
  cuestionarios: 'Responder cuestionarios breves sobre la experiencia de uso',
  datos_abiertos: 'Publicación de las estadísticas por pregunta, anonimizadas',
}

const TEXTO_DECISION = {
  si: ['participando', 'bien'],
  no: ['sin participar', ''],
  aplazada: ['pendiente de decidir', 'aviso'],
}

export async function vistaPerfil(destino, { alCambiar }) {
  nuevaVista(destino)
  const capa = await db()
  const [perfil, consent, hechos, instrumentos] = await Promise.all([
    capa.usuarioActual(),
    capa.consentimientoActual(),
    capa.misCuestionarios().catch(() => []),
    cargarInstrumentos().catch(() => []),
  ])

  const decision = consent?.decision ?? 'si'
  const [etiqueta, tono] = TEXTO_DECISION[decision] ?? TEXTO_DECISION.si
  const participa = decision === 'si'
  const respondidos = new Set(hechos.map((c) => c.tipo))
  const disponibles = instrumentos.filter((i) => !respondidos.has(i.id))

  const nodo = render(
    destino,
    h`<section class="tarjeta" style="max-width:42rem;margin:1rem auto">
      <div class="fila">
        <h1 style="margin:0">Mi participación</h1>
        <span class="pildora ${tono} empuja">Ahora mismo: ${etiqueta}</span>
      </div>
      <p style="color:var(--tinta-suave);margin-top:.8rem">
        Identificador de análisis: <code>${perfil?.seudonimo ?? '—'}</code>.
        Es lo único que aparece en los ficheros del estudio.
      </p>

      ${crudo(
        participa
          ? `<h2 style="margin-top:1.4rem">En qué participas</h2>
             <p class="ayuda">Versión ${consent?.version ?? '—'} · ${fecha(consent?.aceptado_en)}</p>
             <div class="tabla-scroll"><table><tbody>${Object.entries(ETIQUETAS)
               .map(
                 ([k, t]) =>
                   `<tr><td>${t}</td><td>${consent?.[k] ? '<span class="pildora bien">sí</span>' : '<span class="pildora">no</span>'}</td></tr>`,
               )
               .join('')}</tbody></table></div>`
          : `<div class="aviso-caja info" style="margin-top:1.2rem">
               No estás participando en el estudio, y la plataforma funciona para ti exactamente
               igual que para quien participa. No se está registrando nada tuyo.
             </div>`,
      )}

      <h2 style="margin-top:1.6rem">Cambiar de opinión</h2>
      <div class="fila">
        ${crudo(
          participa
            ? `<button class="peligro" id="retirar">Dejar de participar</button>`
            : `<button class="primario" id="sumarme">Quiero participar</button>`,
        )}
      </div>
      <p class="ayuda">
        Sin explicaciones y sin consecuencias. Tu acceso a la plataforma no cambia en ningún caso.
        Para pedir además el borrado de lo ya registrado, escribe al delegado de protección de
        datos: no hace falta que se lo comuniques a tus profesores.
      </p>

      ${crudo(
        participa && consent?.cuestionarios && disponibles.length
          ? `<h2 style="margin-top:1.6rem">Cuestionarios</h2>
             <p class="ayuda" style="margin-top:-.4rem">Opcionales, y puedes saltarte cualquier pregunta.</p>
             ${disponibles
               .map(
                 (i) =>
                   `<button class="pequeno" data-cuest="${i.id}" style="margin:.2rem .3rem .2rem 0">${i.titulo}</button>`,
               )
               .join('')}`
          : '',
      )}
      ${crudo(
        hechos.length
          ? `<p class="ayuda" style="margin-top:1rem">Ya respondidos: ${hechos.map((c) => c.tipo).join(', ')}.</p>`
          : '',
      )}
    </section>`,
  )

  alPulsar(nodo, '#retirar', async () => {
    await capa.revocarConsentimiento()
    await alCambiar()
  })
  alPulsar(nodo, '#sumarme', async () => {
    await capa.guardarConsentimiento({
      version: consent?.version ?? '3.0',
      decision: 'si',
      telemetria: true,
      cuestionarios: true,
      datos_abiertos: false,
    })
    await alCambiar()
  })
  alPulsar(nodo, '[data-cuest]', (b) => {
    const inst = instrumentos.find((i) => i.id === b.dataset.cuest)
    if (inst) alCambiar({ abrirCuestionario: inst })
  })
}
