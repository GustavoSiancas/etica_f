import { useEffect, useState } from 'react'
import type { PeopleFilters, PeoplePage, Person, Role } from '../services/api'
import { formatCal, personasService } from '../services/api'

type SearchMode = 'q' | 'name' | 'document_number' | 'registration_number'
const pageSize = 10

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
function PersonMeta({ person }: { person: Person }) {
  return <span className="pp-meta">
    <span>{person.document_type || 'Doc.'} {person.document_number || 'sin número'}</span>
    {person.registration_number != null && <span className="pp-cal">CAL {formatCal(person.registration_number)}</span>}
  </span>
}

export default function ParticipantPicker({ role, selected, disabled, onAdd, onRemove }: { role: Role; selected: Person[]; disabled: boolean; onAdd: (person: Person) => void; onRemove: (id: number) => void }) {
  const [search, setSearch] = useState({ mode: 'q' as SearchMode, text: '', offset: 0 })
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; page?: PeoplePage; error?: string }>({ key: '' })
  const singular = role === 'denunciantes' ? 'denunciante' : 'denunciado'
  const modes: { id: SearchMode; label: string }[] = [{ id: 'q', label: 'Todo' }, { id: 'name', label: 'Nombre' }, { id: 'document_number', label: 'Documento' }, ...(role === 'denunciados' ? [{ id: 'registration_number' as const, label: 'CAL' }] : [])]
  const query = search.text.trim()
  const key = JSON.stringify([role, search.mode, query, search.offset, retry])
  const loading = result.key !== key
  const current = result.key === key ? result : null
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      const filters: PeopleFilters = query ? { [search.mode]: query } : {}
      personasService.page(role, pageSize, search.offset, filters)
        .then(page => { if (active) setResult({ key, page }) })
        .catch(error => { if (active) setResult({ key, error: error instanceof Error ? error.message : 'No se pudo realizar la búsqueda.' }) })
    }, query ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [role, search.mode, search.offset, query, key])

  const placeholder = search.mode === 'q' ? (role === 'denunciados' ? 'Buscar por nombre, documento o CAL…' : 'Buscar por nombre o documento…') : search.mode === 'name' ? 'Nombre completo o parte del nombre…' : search.mode === 'registration_number' ? 'Número CAL exacto…' : 'Número de documento exacto…'
  const page = current?.page
  const isChosen = (person: Person) => selected.some(item => item.id === person.id)
  const toggle = (person: Person) => { if (!disabled) { if (isChosen(person)) onRemove(person.id); else onAdd(person) } }

  return <div className="pp">
    <section className="pp-search-pane" aria-label={`Buscar ${singular}s`}>
      <div className="pp-searchbar">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input type="search" aria-label={`Buscar ${singular}`} disabled={disabled} inputMode={search.mode === 'document_number' || search.mode === 'registration_number' ? 'numeric' : 'text'} placeholder={placeholder} value={search.text} onChange={event => setSearch(state => ({ ...state, text: event.target.value, offset: 0 }))} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }}/>
        {search.text && <button type="button" className="pp-clear" disabled={disabled} aria-label="Limpiar búsqueda" onClick={() => setSearch(state => ({ ...state, text: '', offset: 0 }))}>×</button>}
        <select aria-label="Buscar por" disabled={disabled} value={search.mode} onChange={event => setSearch(state => ({ ...state, mode: event.target.value as SearchMode, offset: 0 }))}>{modes.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select>
      </div>

      <div className="pp-results-head">
        <span>{loading ? 'Buscando…' : page ? `${page.total.toLocaleString('es-PE')} ${page.total === 1 ? 'resultado' : 'resultados'}` : ''}</span>
        <span className="pp-tip">Haz clic en una persona para seleccionarla</span>
      </div>

      <div className="pp-results" aria-live="polite" aria-busy={loading}>
        {loading && !page ? <ul className="pp-list">{Array.from({ length: 6 }, (_, index) => <li key={index} className="pp-skeleton"><span/><span/></li>)}</ul>
          : current?.error ? <div className="api-error" role="alert">{current.error} <button type="button" className="row-link" disabled={disabled} onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>
          : page && page.data.length ? <ul className={`pp-list${loading ? ' is-loading' : ''}`} role="listbox" aria-multiselectable="true" aria-label="Resultados">
            {page.data.map(person => { const chosen = isChosen(person); return <li key={person.id}>
              <button type="button" role="option" aria-selected={chosen} className={`pp-row${chosen ? ' is-chosen' : ''}`} disabled={disabled} onClick={() => toggle(person)}>
                <span className="pp-check" aria-hidden="true">{chosen && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10"/></svg>}</span>
                <span className="pp-avatar" aria-hidden="true">{initials(person.name)}</span>
                <span className="pp-name"><strong>{person.name}</strong><PersonMeta person={person}/></span>
                <span className="pp-action">{chosen ? 'Seleccionado' : 'Agregar'}</span>
              </button>
            </li> })}
          </ul>
          : page && <div className="pp-empty"><strong>Sin resultados</strong><span>{query ? 'Prueba con otro nombre, documento o tipo de búsqueda.' : `No hay ${singular}s registrados.`}</span></div>}
      </div>

      {page && page.total > pageSize && <div className="pp-pager">
        <button type="button" className="secondary" disabled={disabled || loading || search.offset === 0} onClick={() => setSearch(state => ({ ...state, offset: Math.max(0, state.offset - pageSize) }))} aria-label="Página anterior">‹</button>
        <span>{search.offset + 1}–{Math.min(search.offset + page.data.length, page.total)} de {page.total.toLocaleString('es-PE')}</span>
        <button type="button" className="secondary" disabled={disabled || loading || search.offset + pageSize >= page.total} onClick={() => setSearch(state => ({ ...state, offset: state.offset + pageSize }))} aria-label="Página siguiente">›</button>
      </div>}
    </section>

    <aside className="pp-tray" aria-label={`${singular}s seleccionados`}>
      <header><strong>Seleccionados</strong><span className="pp-count">{selected.length}</span></header>
      {selected.length ? <ul>
        {selected.map(person => <li key={person.id}>
          <span className="pp-avatar is-small" aria-hidden="true">{initials(person.name)}</span>
          <span className="pp-name"><strong>{person.name}</strong><PersonMeta person={person}/></span>
          <button type="button" className="pp-remove" disabled={disabled} aria-label={`Quitar a ${person.name}`} title="Quitar" onClick={() => onRemove(person.id)}>×</button>
        </li>)}
      </ul> : <div className="pp-tray-empty"><span aria-hidden="true">＋</span><p>Aún no hay {singular}s.<br/>Búscalos a la izquierda y haz clic para agregarlos.</p></div>}
    </aside>
  </div>
}
