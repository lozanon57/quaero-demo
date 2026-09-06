/** Vista de un cuestionario. Una pantalla por instrumento, sin paginar. */
import { h, crudo, render, alPulsar, esc } from '../ui.js'
import { completo, puntuar } from '../cuestionarios.js'
import { db } from '../db.js'

function pintarPregunta(p, valor) {
  const req = p.requerida ? '<span aria-hidden="true" style="color:var(--mal)"> *</span>' : ''
  const ayuda = p.ayuda ? `<div class="ayuda">${esc(p.ayuda)}</div>` : ''

  if (p.tipo === 'opcion') {
    return `<fieldset style="border:0;padding:0;margin:0 0 1.4rem">
      <legend style="font-weight:550;margin-bottom:.5rem;padding:0">${esc(p.texto)}${req}</legend>
      ${p.opciones
        .map(
          (o, i) => `<label class="casilla">
            <input type="radio" name="${esc(p.id)}" value="${esc(o)}" ${valor === o ? 'checked' : ''}>
            <span>${esc(o)}</span></label>`,
        )
        .join('')}
      ${ayuda}</fieldset>`
  }

  if (p.tipo === 'multiple') {
    const marcados = Array.isArray(valor) ? valor : []
    return `<fieldset style="border:0;padding:0;margin:0 0 1.4rem">
      <legend style="font-weight:550;margin-bottom:.5rem;padding:0">${esc(p.texto)}${req}</legend>
      ${p.opciones
        .map(
          (o) => `<label class="casilla">
            <input type="checkbox" name="${esc(p.id)}" value="${esc(o)}" ${marcados.includes(o) ? 'checked' : ''}>
            <span>${esc(o)}</span></label>`,
        )
        .join('')}
      ${ayuda}</fieldset>`
  }

  if (p.tipo === 'escala') {
    const v = valor ?? ''
    return `<div class="campo">
      <label for="${esc(p.id)}">${esc(p.texto)}${req}</label>
      <input type="range" id="${esc(p.id)}" name="${esc(p.id)}" min="${p.min}" max="${p.max}" step="1"
             value="${v === '' ? p.min : v}" style="width:100%"
             aria-describedby="val-${esc(p.id)}"
             data-sin-tocar="${v === '' ? '1' : '0'}">
      <div class="fila" style="justify-content:space-between;font-size:.82rem;color:var(--tinta-suave)">
        <span>${esc(p.etiquetaMin ?? p.min)}</span>
        <strong id="val-${esc(p.id)}" style="color:var(--acento);font-size:1rem"
                aria-live="polite">${v === '' ? 'sin responder' : v}</strong>
        <span>${esc(p.etiquetaMax ?? p.max)}</span>
      </div>${ayuda}</div>`
  }

  if (p.tipo === 'texto_libre') {
    return `<div class="campo">
      <label for="${esc(p.id)}">${esc(p.texto)}${req}</label>
      <textarea id="${esc(p.id)}" name="${esc(p.id)}" rows="4"
                maxlength="${p.maxLongitud ?? 1000}">${esc(valor ?? '')}</textarea>
      ${ayuda}</div>`
  }

  return `<div class="campo">
    <label for="${esc(p.id)}">${esc(p.texto)}${req}</label>
    <input type="number" id="${esc(p.id)}" name="${esc(p.id)}"
           min="${p.min ?? ''}" max="${p.max ?? ''}" step="${p.paso ?? 1}" value="${valor ?? ''}">
    ${ayuda}</div>`
}

export function vistaCuestionario(destino, instrumento, { indice, total, alTerminar }) {
  const respuestas = {}

  const nodo = render(
    destino,
    h`<div class="tarjeta" style="max-width:44rem;margin:1rem auto">
      <div class="fila" style="margin-bottom:.4rem">
        <span class="pildora acento">Paso ${indice} de ${total}</span>
      </div>
      <h1>${instrumento.titulo}</h1>
      <p style="color:var(--tinta-suave)">${instrumento.descripcion}</p>
      <div class="barra" style="margin:1rem 0 1.6rem"><span style="width:${(indice / total) * 100}%"></span></div>

      <form id="form-cuest" novalidate>
        ${crudo(instrumento.preguntas.map((p) => pintarPregunta(p, respuestas[p.id])).join(''))}
        <p id="error-cuest" class="ayuda" style="color:var(--mal)"></p>
        <button class="primario" type="submit" style="width:100%">
          ${indice < total ? 'Siguiente' : 'Guardar y entrar'}
        </button>
        <p class="ayuda" style="margin-top:.7rem">
          Los campos con <span style="color:var(--mal)">*</span> son necesarios para el análisis.
          El resto puedes dejarlos en blanco.
        </p>
      </form>
    </div>`,
  )

  // El deslizador arranca sin valor: si el alumno no lo toca, no se inventa un dato.
  for (const r of nodo.querySelectorAll('input[type=range]')) {
    r.addEventListener('input', () => {
      r.dataset.sinTocar = '0'
      nodo.querySelector(`#val-${CSS.escape(r.name)}`).textContent = r.value
    })
  }

  nodo.querySelector('#form-cuest').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const datos = {}
    for (const p of instrumento.preguntas) {
      if (p.tipo === 'multiple') {
        const v = f.getAll(p.id)
        if (v.length) datos[p.id] = v
      } else if (p.tipo === 'escala') {
        const campo = nodo.querySelector(`input[name="${CSS.escape(p.id)}"]`)
        if (campo?.dataset.sinTocar === '0') datos[p.id] = Number(campo.value)
      } else {
        const v = f.get(p.id)
        if (v !== null && String(v).trim() !== '') datos[p.id] = p.tipo === 'numero' ? Number(v) : v
      }
    }

    if (!completo(instrumento, datos)) {
      nodo.querySelector('#error-cuest').textContent =
        'Faltan respuestas necesarias para el análisis. Están marcadas con un asterisco.'
      return
    }

    const boton = nodo.querySelector('button[type=submit]')
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      await (await db()).guardarCuestionario({
        tipo: instrumento.id,
        respuestas: { ...datos, _version_instrumento: instrumento.version ?? '1.0' },
        puntuacion: puntuar(instrumento, datos),
      })
      await alTerminar()
    } catch (err) {
      nodo.querySelector('#error-cuest').textContent = 'No se pudo guardar: ' + err.message
      boton.disabled = false
      boton.textContent = indice < total ? 'Siguiente' : 'Guardar y entrar'
    }
  })
}
