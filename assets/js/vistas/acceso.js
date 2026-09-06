/**
 * Acceso y consentimiento.
 *
 * Dos cosas separadas a propósito, porque el protocolo lo exige: entrar en la
 * plataforma y participar en el estudio no son lo mismo. Se puede usar el banco
 * entero sin consentir nada. La negativa no tiene ninguna consecuencia
 * académica y así se le dice al alumno, con esas palabras.
 */
import { h, crudo, render } from '../ui.js'
import { CONFIG, MODO_LOCAL, DOMINIOS_PERMITIDOS } from '../config.js'
import { db } from '../db.js'

export function vistaAcceso(destino, alEntrar) {
  const nodo = render(
    destino,
    h`
    <div class="tarjeta" style="max-width:34rem;margin:2rem auto">
      <h1>Entrar</h1>
      <p style="color:var(--tinta-suave)">
        ${CONFIG.asignatura}. ${CONFIG.curso}.
      </p>

      ${crudo(
        MODO_LOCAL
          ? `<div class="aviso-caja atencion"><strong>Modo local.</strong> Todavía no hay servidor
             configurado, así que tus datos se guardan solo en este navegador y no salen de él.
             Sirve para probar la plataforma.</div>`
          : `<div class="aviso-caja info">Te enviaremos un enlace de acceso al correo. No hay
             contraseña que recordar.</div>`,
      )}

      <form id="form-acceso" novalidate>
        <div class="campo">
          <label for="email">Correo electrónico</label>
          <input type="email" id="email" name="email" required autocomplete="email"
                 placeholder="nombre@ucm.es">
          <div class="ayuda">Con tu correo entras. No hay nada más que rellenar.</div>
        </div>
        <p id="error-acceso" class="ayuda" style="color:var(--mal)"></p>
        <button class="primario" type="submit" style="width:100%">Entrar</button>
      </form>
    </div>`,
  )

  nodo.querySelector('#form-acceso').addEventListener('submit', async (e) => {
    e.preventDefault()
    const boton = nodo.querySelector('button[type=submit]')
    const error = nodo.querySelector('#error-acceso')
    error.textContent = ''
    boton.disabled = true
    boton.textContent = 'Entrando…'
    try {
      const datos = { email: nodo.querySelector('#email').value.trim().toLowerCase() }
      const dominio = datos.email.split('@')[1] ?? ''
      if (DOMINIOS_PERMITIDOS.length && !DOMINIOS_PERMITIDOS.includes(dominio)) {
        throw new Error(`Solo se admiten correos de: ${DOMINIOS_PERMITIDOS.join(', ')}`)
      }
      const r = await (await db()).registrar(datos)
      if (r?.pendienteEmail) {
        render(
          destino,
          h`<div class="tarjeta" style="max-width:34rem;margin:2rem auto">
             <h1>Revisa tu correo</h1>
             <p>Te hemos enviado un enlace de acceso a <strong>${datos.email}</strong>.
                Ábrelo en este mismo dispositivo para entrar.</p>
           </div>`,
        )
        return
      }
      await alEntrar()
    } catch (err) {
      error.textContent = err.message
      boton.disabled = false
      boton.textContent = 'Entrar'
    }
  })
}
