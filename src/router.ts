import { useMemo, useSyncExternalStore } from 'react'
import type { CaseFile, Person, Role } from './services/api'

// Expediente abierto dentro de una ruta; folderId es null cuando se muestra la carpeta por defecto.
export interface CaseRef {
  id: number
  folderId: number | null
}

export type Route =
  | { name: 'dashboard' }
  | { name: 'expedientes'; creating: boolean; caseRef: CaseRef | null }
  | { name: 'personas'; role: Role; personId: number | null; caseRef: CaseRef | null }
  | { name: 'folder-types' }
  | { name: 'carpetas' }
  | { name: 'not-found' }

// Datos que viajan con la entrada del historial para no volver a consultarlos (sobreviven a recargar la página).
export interface RouteState {
  caseFile?: CaseFile
  person?: Person
}

const navigateEvent = 'app:navigate'

const toId = (value: string | undefined) => {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

// Lee ".../expedientes/:id[/carpetas/:folderId]" a partir de la posición indicada.
function parseCase(parts: string[], start: number): CaseRef | null | undefined {
  if (parts.length === start) return null
  if (parts[start] !== 'expedientes') return undefined
  const id = toId(parts[start + 1])
  if (id === null) return undefined
  if (parts.length === start + 2) return { id, folderId: null }
  const folderId = toId(parts[start + 3])
  if (parts[start + 2] !== 'carpetas' || folderId === null || parts.length !== start + 4) return undefined
  return { id, folderId }
}

export function parseRoute(pathname: string): Route {
  let parts: string[]
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return { name: 'not-found' }
  }
  if (!parts.length) return { name: 'dashboard' }
  if (parts.length === 1 && parts[0] === 'carpetas') return { name: 'carpetas' }
  if (parts.length === 2 && parts[0] === 'admin' && parts[1] === 'tipos-carpeta') return { name: 'folder-types' }
  if (parts[0] === 'expedientes') {
    if (parts.length === 1) return { name: 'expedientes', creating: false, caseRef: null }
    if (parts.length === 2 && parts[1] === 'nuevo')
      return { name: 'expedientes', creating: true, caseRef: null }
    const caseRef = parseCase(parts, 0)
    if (caseRef !== undefined) return { name: 'expedientes', creating: false, caseRef }
    return { name: 'not-found' }
  }
  if (parts[0] === 'denunciantes' || parts[0] === 'denunciados') {
    const role = parts[0]
    if (parts.length === 1) return { name: 'personas', role, personId: null, caseRef: null }
    const personId = toId(parts[1])
    const caseRef = parseCase(parts, 2)
    if (personId !== null && caseRef !== undefined) return { name: 'personas', role, personId, caseRef }
  }
  return { name: 'not-found' }
}

// Constructores de rutas para no escribir las URL a mano.
export const paths = {
  dashboard: () => '/',
  cases: () => '/expedientes',
  newCase: () => '/expedientes/nuevo',
  caseFile: (id: number, folderId?: number | null, base = '') =>
    `${base}/expedientes/${id}${folderId ? `/carpetas/${folderId}` : ''}`,
  people: (role: Role) => `/${role}`,
  person: (role: Role, personId: number) => `/${role}/${personId}`,
  folderTypes: () => '/admin/tipos-carpeta',
  folders: () => '/carpetas',
}

export function navigate(path: string, options: { replace?: boolean; state?: RouteState } = {}) {
  const state = options.state ?? null
  if (options.replace) window.history.replaceState(state, '', path)
  else {
    if (path === window.location.pathname) return
    window.history.pushState(state, '', path)
    window.scrollTo(0, 0)
  }
  window.dispatchEvent(new Event(navigateEvent))
}

// Actualiza los datos guardados en la entrada actual sin cambiar la URL.
export function updateRouteState(patch: RouteState) {
  window.history.replaceState({ ...readRouteState(), ...patch }, '', window.location.href)
}

export function readRouteState(): RouteState {
  const state = window.history.state
  return state && typeof state === 'object' ? (state as RouteState) : {}
}

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener(navigateEvent, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(navigateEvent, callback)
  }
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname)
  return useMemo(() => parseRoute(pathname), [pathname])
}
