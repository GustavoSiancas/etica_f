import { useCallback, useEffect, useRef, useState } from 'react'
import {
  expedientesService,
  formatCal,
  formatCaseNumber,
  initiationTypes,
  peruDate,
  personasService,
} from '../services/api'
import { navigate, paths, readRouteState, updateRouteState } from '../router'
import type { CaseRef, Route } from '../router'
import CaseCreateDialog from './CaseCreateDialog'
import PeopleRegistry from './PeopleRegistry'
import ParticipantProfile from './ParticipantProfile'
import CaseRow from './CaseRow'
import { useAltCaseView } from '../caseView'
import type { ActiveParticipant, CaseFile, Person, Role, InitiationType } from '../services/api'
import CaseDocuments from './CaseDocuments'

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

  const [saving, setSaving] = useState<string | null>(null)
  const altView = useAltCaseView()
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState('')
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
  // La fecha de apertura puede llegar como YYYY-MM-DD o como instante UTC: se muestra el día en Perú.
  const openingDay = peruDate(file.opening_date)
  const formattedDate = openingDay
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(openingDay + 'T00:00:00Z'),
      )
    : 'No disponible'
  return (
    <>
      {/* Mismos bloques en ambas vistas; solo cambia su ubicación (CSS), así no se pierde lo abierto. */}
      <div className={`case-view${altView ? ' is-alt' : ''}`}>
        <section className="case-summary case-hero">
          <div className="case-summary-main">
            <div className="case-hero-top">
              <button type="button" className="case-back" onClick={onBack} title={backLabel}>
                <span aria-hidden="true">←</span> {backLabel}
              </button>
              <p className="eyebrow">EXPEDIENTE</p>
            </div>
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
                        disabled={saving !== null}
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
        </section>
        <CaseDocuments
          expedienteId={file.id}
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
  const [range, setRange] = useState({ from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const page = await expedientesService.page(pageSize, offset, {
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
  }, [offset, range])
  const showList = route.name === 'expedientes' && !route.caseRef
  useEffect(() => {
    if (showList) void load()
  }, [load, showList])
  const peopleRole: Role = route.name === 'personas' ? route.role : 'denunciantes'
  const personId = route.name === 'personas' ? route.personId : null
  const person = usePerson(peopleRole, personId)
  const openCase = (file: CaseFile) => navigate(paths.caseFile(file.id), { state: { caseFile: file } })
  const filtered = range.from !== '' || range.to !== ''
  const rangeInvalid = range.from !== '' && range.to !== '' && range.from > range.to
  const filterBy = (next: { from?: string; to?: string }) => {
    setOffset(0)
    if (next.from !== undefined || next.to !== undefined)
      setRange(current => ({ from: next.from ?? current.from, to: next.to ?? current.to }))
  }
  const clearFilters = () => filterBy({ from: '', to: '' })

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
          <div className="case-list-actions">
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
