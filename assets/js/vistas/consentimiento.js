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
import { h, crudo, render, alPulsar, esc } from '../ui.js'
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
        `<h3 style="margin-top:1.4rem">${esc(s.titulo)}</h3>` +
        s.parrafos.map((p) => `<p>${esc(p)}</p>`).join(''),
    )
    .join('')

  const nodo = render(
    destino,
    h`<div class="tarjeta" style="max-width:46rem;margin:1rem auto">
      <span class="pildora acento">Versión ${doc.version} · ${doc.fecha}</span>
      <h1 style="margin-top:.7rem">${doc.titulo}</h1>
      <p style="color:var(--tinta-suave);margin-bottom:0"><strong>${doc.estudio}</strong></p>
      <p style="color:var(--tinta-suave)">${doc.investigadores}</p>

      <div class="aviso-caja info">
        <strong>Entras igual decidas lo que decidas.</strong> Esta pantalla no condiciona tu
        acceso: solo necesitamos que nos digas si quieres que tus respuestas cuenten para el
        estudio. Puedes cambiar de opinión cuando quieras.
      </div>

      <div id="hoja" tabindex="0" role="region" aria-label="Información sobre el estudio"
           style="max-height:24rem;overflow-y:auto;border:1px solid var(--borde);
           border-radius:var(--r-m);padding:1rem 1.2rem;margin:1.2rem 0;background:var(--superficie-2)">
        ${crudo(secciones)}
        <h3 style="margin-top:1.4rem">Contacto</h3>
        <ul>${crudo(doc.contactos.map((c) => `<li><strong>${esc(c.quien)}:</strong> ${esc(c.dato)}</li>`).join(''))}</ul>
      </div>

      <h3>Si participas, ¿en qué?</h3>
      <p class="ayuda" style="margin-top:-.4rem">Marca lo que quieras. Puedes participar solo en parte.</p>
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

      <p id="error-consent" class="ayuda" style="color:var(--mal)"></p>

      <div class="rejilla tres" style="margin-top:1.5rem">
        <button class="primario" id="participo">Sí, participo</button>
        <button class="primario" id="no-participo">No participo</button>
        <button class="primario" id="mas-tarde">Lo decido más tarde</button>
      </div>
      <p class="ayuda" style="margin-top:.9rem">
        Las tres opciones dan acceso completo a la plataforma. Se guarda tu decisión, la fecha y
        la versión de este texto, para saber sobre qué te pronunciaste.
      </p>
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
