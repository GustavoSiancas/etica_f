import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { caseStatuses, expedientesService, formatCal, formatCaseNumber, initiationTypes, locationLabel, statusLabel } from '../services/api'
import CaseCreateDialog from './CaseCreateDialog'
import PeopleRegistry from './PeopleRegistry'
import ParticipantProfile from './ParticipantProfile'
import useLocations from './useLocations'
import CaseRow from './CaseRow'
import type { ActiveParticipant, CaseFile, CaseStatus, Person, Role, InitiationType } from '../services/api'
import CaseDocuments from './CaseDocuments'
import SuccessDialog from './SuccessDialog'

const pageSize = 20
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Ocurrió un error inesperado.'

type ParticipantState = { data: ActiveParticipant[]; loading: boolean; error: string }
type CaseParticipants = Record<Role, ParticipantState>

function ParticipantDetails({ person }: { person: ActiveParticipant['participant'] }) {
  return <><strong>{person.name}</strong>{person.document_number && <small>{person.document_type} {person.document_number}</small>}{person.registration_number != null && <small className="participant-cal">CAL: {formatCal(person.registration_number)}</small>}</>
}

function PeoplePanel({ role, state, onRetry }: { role: Role; state: ParticipantState; onRetry: () => void }) {
  const { data: active, loading, error } = state
  const label = role === 'denunciantes' ? 'Denunciantes' : 'Denunciados'
  return <section className="management-panel people-panel case-people-panel readonly-participants" aria-labelledby={`case-participants-${role}`}>
    <div className="people-card-heading"><h3 id={`case-participants-${role}`}>{label}</h3><span className="readonly-participant-count">{loading || error ? '\u2014' : active.length}</span></div>
    <h4>Participantes activos</h4>
    {loading ? <p className="detail-empty" role="status">Cargando personas...</p> : error ? <div className="api-error" role="alert">{error}<button type="button" className="secondary" onClick={onRetry}>Reintentar</button></div> : active.length ? <div className="participant-scrollbox" role="region" aria-label={`Lista de ${label.toLowerCase()}`} tabIndex={0}><ul className="case-people-list">{active.map(item => <li key={item.id}><span className="person-avatar">{item.participant.name.slice(0, 1).toUpperCase()}</span><div><ParticipantDetails person={item.participant}/></div></li>)}</ul></div> : <p className="detail-empty">No hay {role} activos.</p>}
  </section>
}
function CaseDetail({ file: initialFile, onBack, onChanged, backLabel = 'Volver a expedientes' }: { file: CaseFile; onBack: () => void; onChanged: (file: CaseFile) => void; backLabel?: string }) {
  const [file, setFile] = useState(initialFile)
  const [participantState, setParticipantState] = useState<CaseParticipants>({ denunciantes: { data: [], loading: true, error: '' }, denunciados: { data: [], loading: true, error: '' } })
  const [participantRefresh, setParticipantRefresh] = useState(0)
  const retryParticipants = () => {
    setParticipantState(current => ({ denunciantes: { ...current.denunciantes, loading: true, error: '' }, denunciados: { ...current.denunciados, loading: true, error: '' } }))
    setParticipantRefresh(value => value + 1)
  }
  useEffect(() => {
    let current = true
    for (const role of ['denunciantes', 'denunciados'] as Role[]) {
      expedientesService.participants(initialFile.id, role)
        .then(rows => { if (current) setParticipantState(state => ({ ...state, [role]: { data: rows.filter(item => item.is_active !== false), loading: false, error: '' } })) })
        .catch(error => { if (current) setParticipantState(state => ({ ...state, [role]: { data: [], loading: false, error: errorMessage(error) } })) })
    }
    return () => { current = false }
  }, [initialFile.id, participantRefresh])

  const locations = useLocations()
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ title: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const closed = file.status === 'CERRADO'
  async function changeStatus(next: string) {
    if (saving || next === file.status) return
    setSaving('status:' + next); setError(''); setMessage(null)
    try { const updated = { ...file, ...await expedientesService.updateStatus(file.id, next) }; setFile(updated); onChanged(updated); setMessage(next === 'CERRADO' ? { title: 'Expediente cerrado', text: `El expediente ${formatCaseNumber(file.number)} quedó cerrado. No se podrán agregar secciones ni documentos hasta reabrirlo, pero sí cambiar su ubicación.` } : { title: 'Expediente reabierto', text: `El expediente ${formatCaseNumber(file.number)} está abierto nuevamente.` }) }
    catch (caught) { setError(errorMessage(caught)) } finally { setSaving(null) }
  }
  async function changeLocation(next: string) {
    if (saving || next === file.location) return
    setSaving('location:' + next); setError(''); setMessage(null)
    try { const updated = { ...file, ...await expedientesService.updateLocation(file.id, next) }; setFile(updated); onChanged(updated); setMessage({ title: 'Ubicación actualizada', text: `El expediente ${formatCaseNumber(file.number)} ahora está en ${locationLabel(next)}.` }) }
    catch (caught) { setError(errorMessage(caught)) } finally { setSaving(null) }
  }
  const track = file.location && !locations.some(option => option.value === file.location) ? [...locations, { value: file.location, label: locationLabel(file.location) }] : locations
  const currentStep = track.findIndex(option => option.value === file.location)
  const parsed = file.opening_date ? new Date(file.opening_date + 'T00:00:00') : null
  const formattedDate = parsed && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(parsed) : 'No disponible'
  return <>
    {message && <SuccessDialog title={message.title} message={message.text} actionLabel="Continuar" onClose={() => setMessage(null)}/>}
    <button className="secondary" onClick={onBack}>← {backLabel}</button>
    <section className="case-summary case-hero">
      <div className="case-summary-main">
        <p className="eyebrow">EXPEDIENTE</p>
        <h2 className="case-number">{formatCaseNumber(file.number)}</h2>
        <dl>
          {file.description && <div><dt>Descripción</dt><dd>{file.description}</dd></div>}
          <div><dt>Tipo de inicio</dt><dd>{initiationTypes[file.init_type as InitiationType] || file.init_type}</dd></div>
          <div><dt>Fecha de apertura</dt><dd>{formattedDate}</dd></div>
          {file.created_at && <div><dt>Creado en sistema</dt><dd>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(file.created_at))}</dd></div>}
        </dl>
      </div>
      <div className="case-controls">
        <div className="control-card">
          <span className="control-label">Estado</span>
          <div className="state-switch" data-value={file.status} role="radiogroup" aria-label="Estado del expediente">
            <span className="state-switch-thumb" aria-hidden="true"/>
            {caseStatuses.map(option => <button key={option.value} type="button" role="radio" aria-checked={file.status === option.value} disabled={saving !== null} onClick={() => void changeStatus(option.value)}>
              <span className="state-dot" aria-hidden="true"/>{saving === 'status:' + option.value ? 'Guardando…' : option.label}
            </button>)}
          </div>
          <small className="control-hint">{closed ? 'Cerrado: no se pueden agregar secciones ni documentos.' : 'En trámite. Se pueden agregar secciones y documentos.'}</small>
        </div>
        <div className="control-card">
          <span className="control-label">Ubicación</span>
          <ol className="location-track" aria-label="Ubicación del expediente" style={{ '--steps': track.length, '--track-progress': currentStep < 0 ? 0 : currentStep / Math.max(1, track.length - 1) } as CSSProperties}>
            {track.map((option, index) => <li key={option.value} className={index < currentStep ? 'is-done' : index === currentStep ? 'is-current' : ''}>
              <button type="button" disabled={saving !== null} aria-current={index === currentStep ? 'step' : undefined} title={`Mover a ${option.label}`} onClick={() => void changeLocation(option.value)}>
                <span className="track-dot" aria-hidden="true">{saving === 'location:' + option.value ? <span className="track-spinner"/> : index + 1}</span>
                <span className="track-label">{option.label}</span>
              </button>
            </li>)}
          </ol>
        </div>
        {error && <p className="api-error case-controls-feedback" role="alert">{error}</p>}
      </div>
    </section>
    <div className="case-detail-layout"><CaseDocuments expedienteId={file.id} locked={closed}/><aside className="case-participants"><PeoplePanel role="denunciantes" state={participantState.denunciantes} onRetry={retryParticipants}/><PeoplePanel role="denunciados" state={participantState.denunciados} onRetry={retryParticipants}/></aside></div>
  </>
}

export default function Management({ view, initialFile = null, peopleRole = 'denunciantes', startCreating = false }: { view: 'expedientes' | 'personas'; initialFile?: CaseFile | null; peopleRole?: Role; startCreating?: boolean }) {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<CaseStatus | ''>('')
  const [location, setLocation] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [active, setActive] = useState<CaseFile | null>(initialFile)
  const [participant, setParticipant] = useState<{ role: Role; person: Person } | null>(null)
  const [createDialog, setCreateDialog] = useState(startCreating)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const locations = useLocations()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const page = await expedientesService.page(pageSize, offset, { status, location, from: range.from, to: range.to }); setFiles(page.data); setTotal(page.total) }
    catch (caught) { setError(errorMessage(caught)); setFiles([]); setTotal(0) }
    finally { setLoading(false) }
  }, [offset, status, location, range])
  useEffect(() => { if (view === 'expedientes' && !active) void load() }, [load, view, active])
  const filtered = status !== '' || location !== '' || range.from !== '' || range.to !== ''
  const rangeInvalid = range.from !== '' && range.to !== '' && range.from > range.to
  const filterBy = (next: { status?: CaseStatus | ''; location?: string; from?: string; to?: string }) => {
    setOffset(0)
    if (next.status !== undefined) setStatus(next.status)
    if (next.location !== undefined) setLocation(next.location)
    if (next.from !== undefined || next.to !== undefined) setRange(current => ({ from: next.from ?? current.from, to: next.to ?? current.to }))
  }
  const clearFilters = () => filterBy({ status: '', location: '', from: '', to: '' })

  if (view === 'personas') {
    // Registro → ficha del participante → detalle del expediente. El registro queda montado (oculto) para conservar filtros y página.
    const profile = participant && participant.role === peopleRole ? participant : null
    return <section className="management" id="gestion">
      <div hidden={!!profile}><PeopleRegistry role={peopleRole} onOpen={person => { setActive(null); setParticipant({ role: peopleRole, person }) }}/></div>
      {profile && (active
        ? <CaseDetail key={active.id} file={active} onBack={() => setActive(null)} onChanged={setActive} backLabel={`Volver a ${profile.person.name}`}/>
        : <ParticipantProfile key={`${profile.role}-${profile.person.id}`} role={profile.role} person={profile.person} onBack={() => setParticipant(null)} onOpenCase={setActive}/>)}
    </section>
  }
  if (active) return <section className="management" id="gestion"><CaseDetail key={active.id} file={active} onBack={() => setActive(null)} onChanged={setActive}/></section>
  return <section className="management" id="gestion">
    <div className="page-heading"><div><h1>Expedientes</h1><p>Consulta expedientes y administra sus documentos y participantes.</p></div><button className="primary" onClick={() => setCreateDialog(true)}>＋ Crear expediente</button></div>
    <section className="dashboard-table case-list">
      <div className="panel-heading case-list-toolbar">
        <div className="status-filter" role="group" aria-label="Filtrar por estado">
          {([['', 'Todos'], ...caseStatuses.map(option => [option.value, option.label])] as [CaseStatus | '', string][]).map(([value, label]) => <button key={value || 'all'} type="button" className={`status-filter-button${status === value ? ' active' : ''}`} aria-pressed={status === value} onClick={() => filterBy({ status: value })}>{label}</button>)}
        </div>
        <div className="case-list-actions">
          <label className="visually-hidden" htmlFor="case-location-filter">Ubicación</label>
          <select id="case-location-filter" className="case-location-filter" value={location} onChange={event => filterBy({ location: event.target.value })}><option value="">Todas las ubicaciones</option>{locations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <div className={`profile-range${rangeInvalid ? ' is-invalid' : ''}`} role="group" aria-label="Fecha de apertura"><label><span>Desde</span><input type="date" value={range.from} max={range.to || undefined} onChange={event => filterBy({ from: event.target.value })}/></label><label><span>Hasta</span><input type="date" value={range.to} min={range.from || undefined} onChange={event => filterBy({ to: event.target.value })}/></label></div>
          {filtered && <button type="button" className="row-link" onClick={clearFilters}>Limpiar filtros</button>}
          <button className="secondary" disabled={loading} onClick={() => void load()}>Actualizar</button>
        </div>
      </div>
      {error && <p className="api-error" role="alert">{error}</p>}
      {loading ? <div className="empty-state" role="status">Cargando expedientes…</div>
        : files.length ? <div className="table-scroll"><table><thead><tr><th>Expediente</th><th>Fecha de apertura</th><th>Tipo de inicio</th><th>Ubicación</th><th>Estado</th></tr></thead><tbody>{files.map(file => <CaseRow key={file.id} file={file} onOpen={setActive}><td><strong>{formatCaseNumber(file.number)}</strong></td><td>{file.opening_date || 'Sin fecha'}</td><td>{initiationTypes[file.init_type as InitiationType] || file.init_type}</td><td>{locationLabel(file.location)}</td><td><span className="status" data-status={file.status}>{statusLabel(file.status)}</span></td></CaseRow>)}</tbody></table></div>
        : !error && <div className="empty-state">{filtered ? <><h3>Sin resultados</h3><p>No hay expedientes con los filtros seleccionados.</p><button className="secondary" onClick={clearFilters}>Limpiar filtros</button></> : <><h3>No hay expedientes</h3><p>Crea el primero para comenzar.</p><button className="primary" onClick={() => setCreateDialog(true)}>Crear expediente</button></>}</div>}
      <div className="table-footer"><span>{total ? `${offset + 1}–${Math.min(offset + files.length, total)} de ${total}` : '0 resultados'}</span><div><button className="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Anterior</button><button className="secondary" disabled={offset + pageSize >= total || loading} onClick={() => setOffset(offset + pageSize)}>Siguiente</button></div></div>
    </section>
    {createDialog && <CaseCreateDialog onClose={() => setCreateDialog(false)} onCreated={created => { setCreateDialog(false); setActive(created); setOffset(0) }}/>}
  </section>
}
