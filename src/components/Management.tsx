import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  caseStatuses,
  expedientesService,
  formatCal,
  formatCaseNumber,
  initiationTypes,
  locationLabel,
  peruDate,
  personasService,
  statusLabel,
} from '../services/api'
import { navigate, paths, readRouteState, updateRouteState } from '../router'
import type { CaseRef, Route } from '../router'
import CaseCreateDialog from './CaseCreateDialog'
import PeopleRegistry from './PeopleRegistry'
import ParticipantProfile from './ParticipantProfile'
import useLocations from './useLocations'
import CaseRow from './CaseRow'
import type { ActiveParticipant, CaseFile, CaseStatus, Person, Role, InitiationType } from '../services/api'
import CaseDocuments from './CaseDocuments'
import SuccessDialog from './SuccessDialog'

const pageSize = 20
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.'

type ParticipantState = { data: ActiveParticipant[]; loading: boolean; error: string }
type CaseParticipants = Record<Role, ParticipantState>
type Loaded<T> = { data: T | null; error: string; retry: () => void }

// Usa el registro guardado en la entrada del historial; si no está (p. ej. un enlace pegado), lo consulta.
function useRouteRecord<T>(
  key: string | null,
  cached: T | undefined,
  load: () => Promise<T>,
  save: (data: T) => void,
): Loaded<T> {
  const [result, setResult] = useState<{ key: string; data: T | null; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loader = useRef({ load, save })
  useEffect(() => {
    loader.current = { load, save }
  })
  const needsFetch = key !== null && cached === undefined
  useEffect(() => {
    if (!needsFetch || key === null) return
    let current = true
    loader.current
      .load()
      .then(data => {
        if (!current) return
        loader.current.save(data)
        setResult({ key, data, error: '' })
      })
      .catch(caught => {
        if (current) setResult({ key, data: null, error: errorMessage(caught) })
      })
    return () => {
      current = false
    }
  }, [key, needsFetch, attempt])
  const retry = () => {
    setResult(null)
    setAttempt(value => value + 1)
  }
  if (cached !== undefined) return { data: cached, error: '', retry }
  if (result && result.key === key) return { data: result.data, error: result.error, retry }
  return { data: null, error: '', retry }
}

function useCaseFile(id: number | null) {
  const cached = readRouteState().caseFile
  return useRouteRecord<CaseFile>(
    id === null ? null : `case:${id}`,
    cached && cached.id === id ? cached : undefined,
    () => expedientesService.findById(id!),
    caseFile => updateRouteState({ caseFile }),
  )
}

function usePerson(role: Role, id: number | null) {
  const cached = readRouteState().person
  return useRouteRecord<Person>(
    id === null ? null : `${role}:${id}`,
    cached && cached.id === id ? cached : undefined,
    () => personasService.findById(role, id!),
    person => updateRouteState({ person }),
  )
}

function RouteStatus({
  loaded,
  label,
  backLabel,
  onBack,
}: {
  loaded: Loaded<unknown>
  label: string
  backLabel: string
  onBack: () => void
}) {
  return (
    <>
      <button className="secondary" onClick={onBack}>
        ← {backLabel}
      </button>
      {loaded.error ? (
        <p className="api-error" role="alert">
          {loaded.error}{' '}
          <button type="button" className="row-link" onClick={loaded.retry}>
            Reintentar
          </button>
        </p>
      ) : (
        <div className="empty-state" role="status">
          Cargando {label}…
        </div>
      )}
    </>
  )
}

// Detalle del expediente indicado en la URL. base es el prefijo de la ruta (p. ej. la ficha de una persona).
function CaseRoute({
  caseRef,
  base = '',
  backLabel,
  onBack,
}: {
  caseRef: CaseRef
  base?: string
  backLabel?: string
  onBack: () => void
}) {
  const loaded = useCaseFile(caseRef.id)
  if (!loaded.data)
    return (
      <RouteStatus
        loaded={loaded}
        label="expediente"
        backLabel={backLabel || 'Volver a expedientes'}
        onBack={onBack}
      />
    )
  const file = loaded.data
  return (
    <CaseDetail
      key={file.id}
      file={file}
      folderId={caseRef.folderId}
      onFolderChange={folderId =>
        navigate(paths.caseFile(file.id, folderId, base), { replace: true, state: readRouteState() })
      }
      onBack={onBack}
      onChanged={caseFile => updateRouteState({ caseFile })}
      backLabel={backLabel}
    />
  )
}

function ParticipantDetails({ person }: { person: ActiveParticipant['participant'] }) {
  return (
    <>
      <strong>{person.name}</strong>
      {person.document_number && (
        <small>
          {person.document_type} {person.document_number}
        </small>
      )}
      {person.registration_number != null && (
        <small className="participant-cal">CAL: {formatCal(person.registration_number)}</small>
      )}
    </>
  )
}

function PeoplePanel({ role, state, onRetry }: { role: Role; state: ParticipantState; onRetry: () => void }) {
  const { data: active, loading, error } = state
  const label = role === 'denunciantes' ? 'Denunciantes' : 'Denunciados'
  return (
    <section
      className="management-panel people-panel case-people-panel readonly-participants"
      aria-labelledby={`case-participants-${role}`}
    >
      <div className="people-card-heading">
        <h3 id={`case-participants-${role}`}>{label}</h3>
        <span className="readonly-participant-count">{loading || error ? '\u2014' : active.length}</span>
      </div>
      <h4>Participantes activos</h4>
      {loading ? (
        <p className="detail-empty" role="status">
          Cargando personas...
        </p>
      ) : error ? (
        <div className="api-error" role="alert">
          {error}
          <button type="button" className="secondary" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : active.length ? (
        <div
          className="participant-scrollbox"
          role="region"
          aria-label={`Lista de ${label.toLowerCase()}`}
          tabIndex={0}
        >
          <ul className="case-people-list">
            {active.map(item => (
              <li key={item.id}>
                <span className="person-avatar">{item.participant.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <ParticipantDetails person={item.participant} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="detail-empty">No hay {role} activos.</p>
      )}
    </section>
  )
}
function CaseDetail({
  file: initialFile,
  folderId,
  onFolderChange,
  onBack,
  onChanged,
  backLabel = 'Volver a expedientes',
}: {
  file: CaseFile
  folderId: number | null
  onFolderChange: (folderId: number) => void
  onBack: () => void
  onChanged: (file: CaseFile) => void
  backLabel?: string
}) {
  const [file, setFile] = useState(initialFile)
  const [participantState, setParticipantState] = useState<CaseParticipants>({
    denunciantes: { data: [], loading: true, error: '' },
    denunciados: { data: [], loading: true, error: '' },
  })
  const [participantRefresh, setParticipantRefresh] = useState(0)
  const retryParticipants = () => {
    setParticipantState(current => ({
      denunciantes: { ...current.denunciantes, loading: true, error: '' },
      denunciados: { ...current.denunciados, loading: true, error: '' },
    }))
    setParticipantRefresh(value => value + 1)
  }
  useEffect(() => {
    let current = true
    for (const role of ['denunciantes', 'denunciados'] as Role[]) {
      expedientesService
        .participants(initialFile.id, role)
        .then(rows => {
          if (current)
            setParticipantState(state => ({
              ...state,
              [role]: { data: rows.filter(item => item.is_active !== false), loading: false, error: '' },
            }))
        })
        .catch(error => {
          if (current)
            setParticipantState(state => ({
              ...state,
              [role]: { data: [], loading: false, error: errorMessage(error) },
            }))
        })
    }
    return () => {
      current = false
    }
  }, [initialFile.id, participantRefresh])

  const locations = useLocations()
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const closed = file.status === 'CERRADO'
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState('')
  useEffect(() => {
    if (closed) setDescriptionDraft(null)
  }, [closed])
  async function saveDescription() {
    if (descriptionDraft === null || saving) return
    if (descriptionDraft.trim() === (file.description || '').trim()) {
      setDescriptionDraft(null)
      return
    }
    setSaving('description')
    setDescriptionError('')
    try {
      const updated = { ...file, ...(await expedientesService.updateDescription(file.id, descriptionDraft)) }
      setFile(updated)
      onChanged(updated)
      setDescriptionDraft(null)
    } catch (caught) {
      setDescriptionError(errorMessage(caught))
    } finally {
      setSaving(null)
    }
  }
  async function changeStatus(next: string) {
    if (saving || next === file.status) return
    setSaving('status:' + next)
    setError('')
    setMessage(null)
    try {
      const updated = { ...file, ...(await expedientesService.updateStatus(file.id, next)) }
      setFile(updated)
      onChanged(updated)
      setMessage(
        next === 'CERRADO'
          ? {
              title: 'Expediente cerrado',
              text: `El expediente ${formatCaseNumber(file.number)} quedó cerrado. No se podrán agregar secciones ni documentos hasta reabrirlo, pero sí cambiar su ubicación.`,
            }
          : {
              title: 'Expediente reabierto',
              text: `El expediente ${formatCaseNumber(file.number)} está abierto nuevamente.`,
            },
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(null)
    }
  }
  async function changeLocation(next: string) {
    if (saving || next === file.location) return
    setSaving('location:' + next)
    setError('')
    setMessage(null)
    try {
      const updated = { ...file, ...(await expedientesService.updateLocation(file.id, next)) }
      setFile(updated)
      onChanged(updated)
      setMessage({
        title: 'Ubicación actualizada',
        text: `El expediente ${formatCaseNumber(file.number)} ahora está en ${locationLabel(next)}.`,
      })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(null)
    }
  }
  const track =
    file.location && !locations.some(option => option.value === file.location)
      ? [...locations, { value: file.location, label: locationLabel(file.location) }]
      : locations
  const currentStep = track.findIndex(option => option.value === file.location)
  // La fecha de apertura puede llegar como YYYY-MM-DD o como instante UTC: se muestra el día en Perú.
  const openingDay = peruDate(file.opening_date)
  const formattedDate = openingDay
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(openingDay + 'T00:00:00Z'),
      )
    : 'No disponible'
  return (
    <>
      {message && (
        <SuccessDialog
          title={message.title}
          message={message.text}
          actionLabel="Continuar"
          onClose={() => setMessage(null)}
        />
      )}
      <button className="secondary" onClick={onBack}>
        ← {backLabel}
      </button>
      <section className="case-summary case-hero">
        <div className="case-summary-main">
          <p className="eyebrow">EXPEDIENTE</p>
          <h2 className="case-number">{formatCaseNumber(file.number)}</h2>
          <dl>
            <div>
              <dt>Descripción</dt>
              <dd>
                {descriptionDraft === null ? (
                  <div className="case-description">
                    <span className={file.description?.trim() ? '' : 'is-empty'}>
                      {file.description?.trim() || 'Sin descripción'}
                    </span>
                    <button
                      type="button"
                      className="row-link"
                      disabled={closed || saving !== null}
                      title={closed ? 'Reabre el expediente para editar la descripción.' : undefined}
                      onClick={() => {
                        setDescriptionError('')
                        setDescriptionDraft(file.description || '')
                      }}
                    >
                      Editar
                    </button>
                  </div>
                ) : (
                  <form
                    className="case-description-form"
                    onSubmit={event => {
                      event.preventDefault()
                      void saveDescription()
                    }}
                  >
                    <textarea
                      rows={3}
                      autoFocus
                      aria-label="Descripción del expediente"
                      value={descriptionDraft}
                      disabled={saving === 'description'}
                      onChange={event => setDescriptionDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Escape' && saving !== 'description') setDescriptionDraft(null)
                      }}
                      placeholder="Resumen breve del caso (déjalo vacío para quitarla)"
                    />
                    {descriptionError && (
                      <p className="api-error" role="alert">
                        {descriptionError}
                      </p>
                    )}
                    <div className="case-description-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={saving === 'description'}
                        onClick={() => setDescriptionDraft(null)}
                      >
                        Cancelar
                      </button>
                      <button className="primary" disabled={saving === 'description'}>
                        {saving === 'description' ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </form>
                )}
              </dd>
            </div>
            <div>
              <dt>Tipo de inicio</dt>
              <dd>{initiationTypes[file.init_type as InitiationType] || file.init_type}</dd>
            </div>
            <div>
              <dt>Fecha de apertura</dt>
              <dd>{formattedDate}</dd>
            </div>
          </dl>
        </div>
        <div className="case-controls">
          <div className="control-card">
            <span className="control-label">Estado</span>
            <div
              className="state-switch"
              data-value={file.status}
              role="radiogroup"
              aria-label="Estado del expediente"
            >
              <span className="state-switch-thumb" aria-hidden="true" />
              {caseStatuses.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={file.status === option.value}
                  disabled={saving !== null}
                  onClick={() => void changeStatus(option.value)}
                >
                  <span className="state-dot" aria-hidden="true" />
                  {saving === 'status:' + option.value ? 'Guardando…' : option.label}
                </button>
              ))}
            </div>
            <small className="control-hint">
              {closed
                ? 'Cerrado: no se pueden agregar secciones ni documentos.'
                : 'En trámite. Se pueden agregar secciones y documentos.'}
            </small>
          </div>
          <div className="control-card">
            <span className="control-label">Ubicación</span>
            <ol
              className="location-track"
              aria-label="Ubicación del expediente"
              style={
                {
                  '--steps': track.length,
                  '--track-progress': currentStep < 0 ? 0 : currentStep / Math.max(1, track.length - 1),
                } as CSSProperties
              }
            >
              {track.map((option, index) => (
                <li
                  key={option.value}
                  className={index < currentStep ? 'is-done' : index === currentStep ? 'is-current' : ''}
                >
                  <button
                    type="button"
                    disabled={saving !== null}
                    aria-current={index === currentStep ? 'step' : undefined}
                    title={`Mover a ${option.label}`}
                    onClick={() => void changeLocation(option.value)}
                  >
                    <span className="track-dot" aria-hidden="true">
                      {saving === 'location:' + option.value ? <span className="track-spinner" /> : index + 1}
                    </span>
                    <span className="track-label">{option.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {error && (
            <p className="api-error case-controls-feedback" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <div className="case-detail-layout">
        <CaseDocuments
          expedienteId={file.id}
          locked={closed}
          folderId={folderId}
          onFolderChange={onFolderChange}
        />
        <aside className="case-participants">
          <PeoplePanel
            role="denunciantes"
            state={participantState.denunciantes}
            onRetry={retryParticipants}
          />
          <PeoplePanel role="denunciados" state={participantState.denunciados} onRetry={retryParticipants} />
        </aside>
      </div>
    </>
  )
}

type ManagementRoute = Extract<Route, { name: 'expedientes' | 'personas' }>

// Toda la navegación sale de la URL: listado, creación, ficha de persona y detalle del expediente.
export default function Management({ route }: { route: ManagementRoute }) {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<CaseStatus | ''>('')
  const [location, setLocation] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const locations = useLocations()
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const page = await expedientesService.page(pageSize, offset, {
        status,
        location,
        from: range.from,
        to: range.to,
      })
      setFiles(page.data)
      setTotal(page.total)
    } catch (caught) {
      setError(errorMessage(caught))
      setFiles([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [offset, status, location, range])
  const showList = route.name === 'expedientes' && !route.caseRef
  useEffect(() => {
    if (showList) void load()
  }, [load, showList])
  const peopleRole: Role = route.name === 'personas' ? route.role : 'denunciantes'
  const personId = route.name === 'personas' ? route.personId : null
  const person = usePerson(peopleRole, personId)
  const openCase = (file: CaseFile) => navigate(paths.caseFile(file.id), { state: { caseFile: file } })
  const filtered = status !== '' || location !== '' || range.from !== '' || range.to !== ''
  const rangeInvalid = range.from !== '' && range.to !== '' && range.from > range.to
  const filterBy = (next: { status?: CaseStatus | ''; location?: string; from?: string; to?: string }) => {
    setOffset(0)
    if (next.status !== undefined) setStatus(next.status)
    if (next.location !== undefined) setLocation(next.location)
    if (next.from !== undefined || next.to !== undefined)
      setRange(current => ({ from: next.from ?? current.from, to: next.to ?? current.to }))
  }
  const clearFilters = () => filterBy({ status: '', location: '', from: '', to: '' })

  if (route.name === 'personas') {
    // Registro → ficha de la persona → detalle del expediente. El registro queda montado (oculto) para conservar filtros y página.
    const { role, caseRef } = route
    const profilePath = personId === null ? '' : paths.person(role, personId)
    const fallbackName = role === 'denunciantes' ? 'el denunciante' : 'el denunciado'
    return (
      <section className="management" id="gestion">
        <div hidden={personId !== null}>
          <PeopleRegistry
            role={role}
            onOpen={selected => navigate(paths.person(role, selected.id), { state: { person: selected } })}
          />
        </div>
        {personId !== null &&
          (caseRef ? (
            <CaseRoute
              caseRef={caseRef}
              base={profilePath}
              backLabel={`Volver a ${person.data?.name || fallbackName}`}
              onBack={() => navigate(profilePath)}
            />
          ) : person.data ? (
            <ParticipantProfile
              key={`${role}-${person.data.id}`}
              role={role}
              person={person.data}
              onBack={() => navigate(paths.people(role))}
              onOpenCase={file =>
                navigate(paths.caseFile(file.id, null, profilePath), {
                  state: { ...readRouteState(), caseFile: file },
                })
              }
            />
          ) : (
            <RouteStatus
              loaded={person}
              label="la ficha"
              backLabel={`Volver a ${role}`}
              onBack={() => navigate(paths.people(role))}
            />
          ))}
      </section>
    )
  }
  if (route.caseRef)
    return (
      <section className="management" id="gestion">
        <CaseRoute caseRef={route.caseRef} onBack={() => navigate(paths.cases())} />
      </section>
    )
  return (
    <section className="management" id="gestion">
      <div className="page-heading">
        <div>
          <h1>Expedientes</h1>
          <p>Consulta expedientes y administra sus documentos y participantes.</p>
        </div>
        <button className="primary" onClick={() => navigate(paths.newCase())}>
          ＋ Crear expediente
        </button>
      </div>
      <section className="dashboard-table case-list">
        <div className="panel-heading case-list-toolbar">
          <div className="status-filter" role="group" aria-label="Filtrar por estado">
            {(
              [['', 'Todos'], ...caseStatuses.map(option => [option.value, option.label])] as [
                CaseStatus | '',
                string,
              ][]
            ).map(([value, label]) => (
              <button
                key={value || 'all'}
                type="button"
                className={`status-filter-button${status === value ? ' active' : ''}`}
                aria-pressed={status === value}
                onClick={() => filterBy({ status: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="case-list-actions">
            <label className="visually-hidden" htmlFor="case-location-filter">
              Ubicación
            </label>
            <select
              id="case-location-filter"
              className="case-location-filter"
              value={location}
              onChange={event => filterBy({ location: event.target.value })}
            >
              <option value="">Todas las ubicaciones</option>
              {locations.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div
              className={`profile-range${rangeInvalid ? ' is-invalid' : ''}`}
              role="group"
              aria-label="Fecha de apertura"
            >
              <label>
                <span>Desde</span>
                <input
                  type="date"
                  value={range.from}
                  max={range.to || undefined}
                  onChange={event => filterBy({ from: event.target.value })}
                />
              </label>
              <label>
                <span>Hasta</span>
                <input
                  type="date"
                  value={range.to}
                  min={range.from || undefined}
                  onChange={event => filterBy({ to: event.target.value })}
                />
              </label>
            </div>
            {filtered && (
              <button type="button" className="row-link" onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
            <button className="secondary" disabled={loading} onClick={() => void load()}>
              Actualizar
            </button>
          </div>
        </div>
        {error && (
          <p className="api-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="empty-state" role="status">
            Cargando expedientes…
          </div>
        ) : files.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Fecha de apertura</th>
                  <th>Tipo de inicio</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <CaseRow key={file.id} file={file} onOpen={openCase}>
                    <td>
                      <strong>{formatCaseNumber(file.number)}</strong>
                    </td>
                    <td>{peruDate(file.opening_date) || 'Sin fecha'}</td>
                    <td>{initiationTypes[file.init_type as InitiationType] || file.init_type}</td>
                    <td>{locationLabel(file.location)}</td>
                    <td>
                      <span className="status" data-status={file.status}>
                        {statusLabel(file.status)}
                      </span>
                    </td>
                  </CaseRow>
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
                  <p>No hay expedientes con los filtros seleccionados.</p>
                  <button className="secondary" onClick={clearFilters}>
                    Limpiar filtros
                  </button>
                </>
              ) : (
                <>
                  <h3>No hay expedientes</h3>
                  <p>Crea el primero para comenzar.</p>
                  <button className="primary" onClick={() => navigate(paths.newCase())}>
                    Crear expediente
                  </button>
                </>
              )}
            </div>
          )
        )}
        <div className="table-footer">
          <span>
            {total ? `${offset + 1}–${Math.min(offset + files.length, total)} de ${total}` : '0 resultados'}
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
      {route.creating && (
        <CaseCreateDialog
          onClose={() => navigate(paths.cases(), { replace: true })}
          onCreated={created => {
            setOffset(0)
            navigate(paths.caseFile(created.id), { replace: true, state: { caseFile: created } })
          }}
        />
      )}
    </section>
  )
}
