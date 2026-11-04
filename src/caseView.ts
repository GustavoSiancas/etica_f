import { useSyncExternalStore } from 'react'

// Vista del detalle del expediente: la normal o la alternativa (columna lateral + documentos).
// Se recuerda en este navegador; si no hay almacenamiento, solo dura la sesión.
const key = 'case-view'
const changeEvent = 'app:case-view'
let memory = false

function read() {
  try {
    return localStorage.getItem(key) === 'alt'
  } catch {
    return memory
  }
}

export function setAltCaseView(next: boolean) {
  memory = next
  try {
    localStorage.setItem(key, next ? 'alt' : 'default')
  } catch {
    // Sin almacenamiento: se usa el valor en memoria.
  }
  window.dispatchEvent(new Event(changeEvent))
}

function subscribe(callback: () => void) {
  window.addEventListener(changeEvent, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(changeEvent, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useAltCaseView() {
  return useSyncExternalStore(subscribe, read)
}
