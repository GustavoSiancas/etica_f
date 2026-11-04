import { useCallback, useEffect, useState } from 'react'
import {
  caseStatuses,
  folderName,
  foldersService,
  formatCaseNumber,
  locationLabel,
  peruDate,
  statusLabel,
} from '../services/api'
import type { FolderFilters, FolderType, GlobalFolder } from '../services/api'
import { navigate, paths } from '../router'
import useLocations from './useLocations'
import './FoldersList.css'

const pageSize = 20
const emptyFilters = { q: '', status: '', location: '', folder_type_id: '', from: '', to: '' }
type Filters = typeof emptyFilters

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.'

function formatDay(value?: string | null) {
  const day = peruDate(value)
  if (!day) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(day + 'T00:00:00Z'),
  )
}

// Menú "Carpetas": todas las carpetas de todos los expedientes (GET /folders).
export default function FoldersList() {
  const [rows, setRows] = useState<GlobalFolder[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  // La búsqueda se envía un momento después de dejar de escribir.
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [types, setTypes] = useState<FolderType[]>([])
  const locations = useLocations()

  useEffect(() => {
    let current = true
    foldersService
      .types()
      .then(list => {
        if (current) setTypes(list)
      })
      .catch(() => {
        /* El filtro por tipo queda vacío si falla el catálogo. */
      })
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== filters.q) {
        setOffset(0)
        setFilters(current => ({ ...current, q: search.trim() }))
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [search, filters.q])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query: FolderFilters = {
        q: filters.q,
        status: filters.status,
        location: filters.location,
        folder_type_id: filters.folder_type_id ? Number(filters.folder_type_id) : null,
        from: filters.from,
        to: filters.to,
      }
      const page = await foldersService.page(pageSize, offset, query)
      setRows(page.data)
      setTotal(page.total)
    } catch (caught) {
      setError(errorMessage(caught))
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, offset])

  useEffect(() => {
    void load()
  }, [load])

  const update = (patch: Partial<Filters>) => {
    setOffset(0)
    setFilters(current => ({ ...current, ...patch }))
  }
  const clear = () => {
    setSearch('')
    setOffset(0)
    setFilters(emptyFilters)
  }
  const filtered = Object.values(filters).some(Boolean) || search.trim() !== ''
  const rangeInvalid = filters.from !== '' && filters.to !== '' && filters.from > filters.to
  const open = (folder: GlobalFolder) => navigate(paths.caseFile(folder.expediente_id, folder.id))

  return (
    <section className="management folders-page">
      <div className="page-heading">
        <div>
          <h1>Carpetas</h1>
          <p>Todas las carpetas de los expedientes, con su estado y ubicación.</p>
        </div>
      </div>

      <section className="dashboard-table case-list">
        <div className="folders-toolbar">
          <div className="folders-toolbar-row">
            <div className="folders-search">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                value={search}
                maxLength={255}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar por denominación o nombre (ej. 00004-2026 o MC)"
                aria-label="Buscar carpetas"
              />
            </div>
            <select
              className="folders-type"
              aria-label="Tipo de carpeta"
              value={filters.folder_type_id}
              onChange={event => update({ folder_type_id: event.target.value })}
            >
              <option value="">Todos los tipos</option>
              {types.map(type => (
                <option key={type.id} value={type.id}>
                  {type.abbreviation ? `${type.abbreviation} · ` : ''}
                  {folderName(type.name)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary folders-refresh"
              disabled={loading}
              onClick={() => void load()}
              aria-label="Actualizar"
              title="Actualizar"
            >
              ↻
            </button>
          </div>
          <div className="folders-toolbar-row folders-facets">
            <div className="folders-facet">
              <span className="folders-facet-label">Estado</span>
              <div className="folders-segmented" role="group" aria-label="Filtrar por estado">
                {([['', 'Todos'], ...caseStatuses.map(option => [option.value, option.label])] as [string, string][]).map(
                  ([value, label]) => (
                    <button
                      key={value || 'all'}
                      type="button"
                      className={filters.status === value ? 'is-active' : ''}
                      aria-pressed={filters.status === value}
                      data-status={value || undefined}
                      onClick={() => update({ status: value })}
                    >
                      {value && <i aria-hidden="true" />}
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="folders-facet">
              <span className="folders-facet-label">Ubicación</span>
              <div className="folders-segmented" role="group" aria-label="Filtrar por ubicación">
                {[{ value: '', label: 'Todas' }, ...locations].map(option => (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    className={filters.location === option.value ? 'is-active' : ''}
                    aria-pressed={filters.location === option.value}
                    onClick={() => update({ location: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="folders-facet">
              <span className="folders-facet-label">Apertura</span>
              <div
                className={`profile-range${rangeInvalid ? ' is-invalid' : ''}`}
                role="group"
                aria-label="Fecha de apertura"
              >
                <label>
                  <span>Desde</span>
                  <input
                    type="date"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={event => update({ from: event.target.value })}
                  />
                </label>
                <label>
                  <span>Hasta</span>
                  <input
                    type="date"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={event => update({ to: event.target.value })}
                  />
                </label>
              </div>
            </div>
            {filtered && (
              <button type="button" className="row-link folders-clear" onClick={clear}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="api-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="empty-state" role="status">
            Cargando carpetas…
          </div>
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Denominación</th>
                  <th>Carpeta</th>
                  <th>Expediente</th>
                  <th>Apertura</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(folder => (
                  <tr
                    key={folder.id}
                    className="case-row"
                    tabIndex={0}
                    aria-label={`Abrir carpeta ${folder.denomination || folderName(folder.name)}`}
                    onClick={() => open(folder)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        open(folder)
                      }
                    }}
                  >
                    <td>
                      <span className="folders-denomination">
                        {folder.abbreviation && <span className="folders-abbr">{folder.abbreviation}</span>}
                        <strong>
                          {folder.denomination ||
                            `${folder.expediente_number ? formatCaseNumber(folder.expediente_number) : ''}`}
                        </strong>
                      </span>
                    </td>
                    <td>{folderName(folder.name)}</td>
                    <td>
                      {folder.expediente_number
                        ? formatCaseNumber(folder.expediente_number)
                        : `#${folder.expediente_id}`}
                    </td>
                    <td>{formatDay(folder.opening_date)}</td>
                    <td>{locationLabel(folder.location)}</td>
                    <td>
                      <span className="status" data-status={folder.status}>
                        {statusLabel(folder.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !error && (
            <div className="empty-state">
              {filtered ? (
                <>
                  <h3>Sin resultados</h3>
                  <p>No hay carpetas con los filtros seleccionados.</p>
                  <button className="secondary" onClick={clear}>
                    Limpiar filtros
                  </button>
                </>
              ) : (
                <>
                  <h3>No hay carpetas</h3>
                  <p>Las carpetas se crean dentro de cada expediente.</p>
                </>
              )}
            </div>
          )
        )}
        <div className="table-footer">
          <span>
            {total ? `${offset + 1}–${Math.min(offset + rows.length, total)} de ${total}` : '0 resultados'}
          </span>
          <div>
            <button
              className="secondary"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Anterior
            </button>
            <button
              className="secondary"
              disabled={offset + pageSize >= total || loading}
              onClick={() => setOffset(offset + pageSize)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>
    </section>
  )
}
