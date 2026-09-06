/** Ayudantes de render. Sin framework: la aplicación es pequeña y no lo necesita. */

/** Escapa texto para interpolarlo en HTML. Todo lo que venga del banco o del
 *  alumno pasa por aquí — una comilla en el enunciado no puede romper la página. */
export function esc(t) {
  return String(t ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Plantilla etiquetada que escapa las interpolaciones por defecto.
 *  Para insertar HTML ya construido, envuélvelo en crudo(). */
export function h(cadenas, ...valores) {
  return cadenas.reduce((acc, s, i) => {
    if (i === 0) return s
    const v = valores[i - 1]
    const texto = v?.__crudo ? v.html : Array.isArray(v) ? v.map((x) => (x?.__crudo ? x.html : esc(x))).join('') : esc(v)
    return acc + texto + s
  }, '')
}

export const crudo = (html) => ({ __crudo: true, html })

export function render(destino, html) {
  const nodo = typeof destino === 'string' ? document.querySelector(destino) : destino
  nodo.innerHTML = html
  return nodo
}

/** Delegación de eventos: un único listener por vista, no uno por botón. */
export function alPulsar(raiz, selector, fn) {
  raiz.addEventListener('click', (e) => {
    const objetivo = e.target.closest(selector)
    if (objetivo && raiz.contains(objetivo)) fn(objetivo, e)
  })
}

export const minutos = (ms) => Math.round(ms / 60000)

export function reloj(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const pct = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : `${Math.round(x * 100)} %`)

/** Días naturales que faltan para una fecha ISO. */
export function diasHasta(iso) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(iso) - hoy) / 86400000)
}

export function metrica(valor, etiqueta) {
  return h`<div class="metrica"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`
}

export function aviso(texto, tipo = 'info') {
  return h`<div class="aviso-caja ${tipo}">${crudo(texto)}</div>`
}

/** Descarga un CSV construido en memoria. */
export function descargarCSV(nombre, filas) {
  if (!filas.length) return
  const cols = [...new Set(filas.flatMap((f) => Object.keys(f)))]
  const celda = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const csv = [cols.join(';'), ...filas.map((f) => cols.map((c) => celda(f[c])).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
