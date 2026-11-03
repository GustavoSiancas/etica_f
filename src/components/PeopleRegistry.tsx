import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { formatCal, personasService } from '../services/api'
import type { DocumentType, PeopleFilters, PeoplePage, Person, Role } from '../services/api'

const emptyFilters: PeopleFilters = {
  q: '',
  name: '',
  document_type: '',
  document_number: '',
  registration_number: '',
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la operación.'

function PeopleTable({ role, onOpen }: { role: Role; onOpen?: (person: Person) => void }) {
  const [draft, setDraft] = useState<PeopleFilters>(emptyFilters)
  const [filters, setFilters] = useState<PeopleFilters>(emptyFilters)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(20)
  const [page, setPage] = useState<PeoplePage>({ data: [], total: 0, limit: 20, offset: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    personasService
      .page(role, limit, offset, filters)
      .then(result => {
        if (current) setPage(result)
      })
      .catch(error => {
        if (current) setError(message(error))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [role, limit, offset, filters, refresh])
  function pending() {
    setLoading(true)
    setError('')
  }
  function apply(event: FormEvent) {
    event.preventDefault()
    pending()
    setOffset(0)
    setFilters({ ...draft })
  }
  const label = role === 'denunciantes' ? 'Denunciantes' : 'Denunciados'
  return (
    <section className="people-registry">
      <header className="registry-heading">
        <div>
          <h1>{label}</h1>
          <p>Consulta, filtra y administra los {label.toLowerCase()}.</p>
        </div>
      </header>
      <div className="registry-workspace">
        <form className="registry-filters" onSubmit={apply}>
          <div className="registry-input-row">
            <div className="registry-search-field">
              <label htmlFor="filter-q">Búsqueda general</label>
              <input
                id="filter-q"
                type="search"
                placeholder={role === 'denunciados' ? 'Nombre, documento o CAL' : 'Nombre o documento'}
                value={draft.q}
                onChange={event => setDraft({ ...draft, q: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="filter-name">Nombre</label>
              <input
                id="filter-name"
                value={draft.name}
                onChange={event => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="filter-number">Documento exacto</label>
              <input
                id="filter-number"
                inputMode="numeric"
                pattern="[0-9]{1,20}"
                maxLength={20}
                value={draft.document_number}
                onChange={event => setDraft({ ...draft, document_number: event.target.value })}
              />
            </div>
            {role === 'denunciados' && (
              <div>
                <label htmlFor="filter-registration">CAL exacto</label>
                <input
                  id="filter-registration"
                  type="number"
                  min="1"
                  step="1"
                  value={draft.registration_number}
                  onChange={event => setDraft({ ...draft, registration_number: event.target.value })}
                />
              </div>
            )}
          </div>
          <div className="registry-filter-toolbar">
            <div className="registry-document-filter" role="group" aria-labelledby="filter-type-label">
              <span id="filter-type-label">Tipo de documento</span>
              <div className="registry-document-options">
                {(
                  ['', ...(role === 'denunciantes' ? ['DNI', 'RUC', 'CE'] : ['DNI', 'CE'])] as (
                    | DocumentType
                    | ''
                  )[]
                ).map(type => (
                  <button
                    key={type || 'all'}
                    type="button"
                    aria-pressed={draft.document_type === type}
                    onClick={() => setDraft(current => ({ ...current, document_type: type }))}
                  >
                    {type || 'Todos'}
                  </button>
                ))}
              </div>
            </div>
            <div className="registry-filter-actions">
              <button className="primary">Buscar</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  pending()
                  setDraft(emptyFilters)
                  setFilters({ ...emptyFilters })
                  setOffset(0)
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </form>
        <div className="registry-results-heading">
          <h2>Listado de {label.toLowerCase()}</h2>
          <span>
            {loading
              ? 'Consultando...'
              : error
                ? ''
                : `${page.total} ${page.total === 1 ? 'registro' : 'registros'}`}
          </span>
        </div>
        {error && (
          <p className="api-error" role="alert">
            {error}{' '}
            <button
              className="secondary"
              onClick={() => {
                pending()
                setRefresh(value => value + 1)
              }}
            >
              Reintentar
            </button>
          </p>
        )}
        {loading ? (
          <p className="detail-empty" role="status">
            Cargando {label.toLowerCase()}…
          </p>
        ) : (
          !error && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nombre</th>
                      <th>Tipo de documento</th>
                      <th>Número de documento</th>
                      {role === 'denunciados' && <th>CAL</th>}
                      {onOpen && <th aria-label="Ver ficha" />}
                    </tr>
                  </thead>
                  <tbody>
                    {page.data.length ? (
                      page.data.map(person => (
                        <tr
                          key={person.id}
                          className={onOpen ? 'case-row person-row' : undefined}
                          tabIndex={onOpen ? 0 : undefined}
                          aria-label={onOpen ? `Ver ficha de ${person.name}` : undefined}
                          onClick={onOpen ? () => onOpen(person) : undefined}
                          onKeyDown={
                            onOpen
                              ? event => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    onOpen(person)
                                  }
                                }
                              : undefined
                          }
                        >
                          <td>{person.id}</td>
                          <td>{person.name}</td>
                          <td>{person.document_type}</td>
                          <td>{person.document_number}</td>
                          {role === 'denunciados' && <td>{formatCal(person.registration_number)}</td>}
                          {onOpen && <td className="person-row-open">Ver ficha →</td>}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={(role === 'denunciados' ? 5 : 4) + (onOpen ? 1 : 0)}>
                          No se encontraron {label.toLowerCase()} con estos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
        <div className="registry-pagination">
          <label htmlFor="people-page-size">
            Por página{' '}
            <select
              id="people-page-size"
              value={limit}
              disabled={loading}
              onChange={event => {
                pending()
                setLimit(Number(event.target.value))
                setOffset(0)
              }}
            >
              {[10, 20, 50, 100].map(size => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <span aria-live="polite">
            {loading
              ? 'Cargando…'
              : error
                ? 'Sin resultados disponibles'
                : `${page.total && page.data.length ? offset + 1 : 0}–${Math.min(offset + page.data.length, page.total)} de ${page.total}`}
          </span>
          <div>
            <button
              className="secondary"
              disabled={loading || !!error || offset === 0}
              onClick={() => {
                pending()
                setOffset(Math.max(0, offset - limit))
              }}
            >
              Anterior
            </button>
            <button
              className="secondary"
              disabled={loading || !!error || offset + limit >= page.total}
              onClick={() => {
                pending()
                setOffset(offset + limit)
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function PeopleRegistry({ role, onOpen }: { role: Role; onOpen?: (person: Person) => void }) {
  return <PeopleTable key={role} role={role} onOpen={onOpen} />
}
