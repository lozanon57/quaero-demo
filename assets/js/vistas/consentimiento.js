/**
 * Decisión sobre la participación en el estudio.
 *
 * **Elección forzada, no consentimiento forzado.** La pantalla es ineludible —
 * nadie entra sin pronunciarse — pero las tres salidas pesan lo mismo: mismo
 * tamaño, misma fila, mismo contraste. Condicionar el acceso al material a
 * ceder datos, siendo los investigadores quienes examinan, es el caso que el
 * RGPD (art. 7.4 y considerando 43) señala como consentimiento no libre.
 *
 * Esto consigue lo que se buscaba —cero decisiones sin documentar, cero alumnos
 * que se salten la pantalla— sin condicionar nada. Quien dice que no recibe la
 * plataforma **idéntica**: si el no participante recibiera un producto peor,
 * sería coerción por la puerta de atrás.
 */
import { h, crudo, render, alPulsar, esc, nuevaVista } from '../ui.js'
import { db } from '../db.js'

const RUTA = 'contenidos/consentimiento.json'

/** Huella del texto aceptado, para poder acreditar qué se decidió sobre qué. */
async function huella(texto) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  } catch {
    return null
  }
}

export async function vistaConsentimiento(destino, alDecidir) {
  nuevaVista(destino)
  render(destino, h`<div class="vacio">Cargando…</div>`)

  let doc
  try {
    const r = await fetch(RUTA)
    if (!r.ok) throw new Error(`no se pudo cargar (${r.status})`)
    doc = await r.json()
  } catch (e) {
    render(
      destino,
      h`<div class="tarjeta"><h1>No se puede continuar</h1>
        <p>No se ha podido cargar la hoja de información (${e.message}).</p>
        <p class="ayuda">La aplicación se detiene aquí a propósito: nadie debe entrar sin haber
        podido leer en qué consiste el estudio. Avisa al investigador principal.</p></div>`,
    )
    return
  }

  const secciones = doc.secciones
    .map(
      (s) =>
        `<section class="apartado"><h3>${esc(s.titulo)}</h3>` +
        s.parrafos.map((p) => `<p>${esc(p)}</p>`).join('') +
        '</section>',
    )
    .join('')

  const nodo = render(
    destino,
    h`<div class="tarjeta hoja" style="max-width:42rem;margin:1rem auto">
      <p class="rotulo">Hoja de información · versión ${doc.version}</p>
      <h1>${doc.titulo}</h1>
      <p class="entrada">Entras igual decidas lo que decidas. Solo necesitamos saber si quieres
      que tus respuestas cuenten para el estudio, y puedes cambiar de opinión cuando quieras.</p>

      <div id="hoja" tabindex="-1" role="region" aria-label="Información sobre el estudio">
        ${crudo(secciones)}
      </div>

      <section class="apartado">
        <h3>Si participas, ¿en qué?</h3>
        <p class="ayuda" style="margin-top:-.2rem">Marca lo que quieras. Puedes participar solo en parte.</p>
      ${crudo(
        doc.opcionales
          .map(
            (i) =>
              `<label class="casilla">
                 <input type="checkbox" data-clave="${esc(i.clave)}" checked>
                 <span>${i.texto}</span>
               </label>`,
          )
          .join(''),
      )}

      </section>

      <p id="error-consent" class="ayuda" style="color:var(--mal)"></p>

      <!-- Las tres con el mismo peso visual, a proposito. Destacar el «si» seria
           un empujon, y quien lo da es ademas quien pone las notas. -->
      <div class="rejilla tres decision">
        <button class="primario" id="participo">Sí, participo</button>
        <button class="primario" id="no-participo">No participo</button>
        <button class="primario" id="mas-tarde">Lo decido más tarde</button>
      </div>
      <p class="ayuda" style="margin-top:.9rem">
        Las tres dan acceso completo. Se guarda tu decisión, la fecha y la versión de este texto.
      </p>

      <!-- Abierto por defecto: el del delegado de proteccion de datos es el
           canal por el que se pide el borrado sin pasar por el profesor que
           examina, y no puede quedar detras de un clic. -->
      <details class="avanzado contactos" open>
        <summary>Contacto y reclamaciones</summary>
        <ul>${crudo(
          doc.contactos.map((c) => `<li><strong>${esc(c.quien)}:</strong> ${esc(c.dato)}</li>`).join(''),
        )}</ul>
      </details>
    </div>`,
  )

  const decidir = async (decision, boton) => {
    boton.disabled = true
    const original = boton.textContent
    boton.textContent = 'Guardando…'
    try {
      const marcadas = {}
      for (const c of nodo.querySelectorAll('input[data-clave]')) {
        // Solo cuentan si participa: decir "no" no puede dejar casillas activas.
        marcadas[c.dataset.clave] = decision === 'si' ? c.checked : false
      }
      await (await db()).guardarConsentimiento({
        version: doc.version,
        decision,
        ...marcadas,
        huella_texto: await huella(JSON.stringify(doc)),
      })
      await alDecidir()
    } catch (e) {
      nodo.querySelector('#error-consent').textContent = 'No se pudo guardar: ' + e.message
      boton.disabled = false
      boton.textContent = original
    }
  }

  // Ni confirmación, ni retardo, ni «¿estás seguro?» sobre declinar: cualquiera
  // de esas fricciones es un empujón sobre una población cautiva.
  alPulsar(nodo, '#participo', (b) => decidir('si', b))
  alPulsar(nodo, '#no-participo', (b) => decidir('no', b))
  alPulsar(nodo, '#mas-tarde', (b) => decidir('aplazada', b))
}
