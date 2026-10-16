import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { expedientesService, personasService, initiationTypes } from '../services/api'
import type { ActiveParticipant, CaseDocument, CaseFile, DocumentStage, Person, Role, InitiationType } from '../services/api'

const pageSize = 20
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Ocurrió un error inesperado.'

function PeoplePanel({ role, expediente, onChanged }: { role: Role; expediente?: CaseFile | null; onChanged?: () => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [active, setActive] = useState<ActiveParticipant[]>([])
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [dialog, setDialog] = useState(false)
  const label = role === 'denunciantes' ? 'Denunciantes' : 'Denunciados'
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (expediente) { const [rows, registry] = await Promise.all([expedientesService.participants(expediente.id, role), personasService.list(role, 100, 0)]); setActive(rows); setPeople(registry) }
      else setPeople(await personasService.list(role, 100, 0))
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setLoading(false) }
  }, [expediente, role])
  useEffect(() => { void load() }, [load, refresh])
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try { const person = await personasService.create(role, name); if (expediente) { await expedientesService.associate(expediente.id, role, person.id); setMessage(`${person.name} agregada al expediente.`) } else setMessage(`${label.slice(0,-1)} registrada.`); setName(''); setDialog(false); setRefresh(value => value + 1); onChanged?.() }
    catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  async function associate(personId: number) {
    if (!expediente) return; setBusy(true); setError(''); setMessage('')
    try { await expedientesService.associate(expediente.id, role, personId); setMessage('Participante agregado al expediente.'); setDialog(false); setRefresh(value => value + 1); onChanged?.() }
    catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  async function remove(personId: number) {
    if (!expediente) return; setBusy(true); setError('')
    try { await expedientesService.remove(expediente.id, role, personId); setMessage('Participante retirado del expediente.'); setRefresh(value => value + 1); onChanged?.() }
    catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  const available = people.filter(person => !active.some(item => item.participant.id === person.id))
  const searchable = (expediente ? available : people).filter(person => person.name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')) || String(person.id).includes(query.trim()))
  return <section className={`management-panel people-panel${expediente ? ' case-people-panel' : ''}`}><div className="people-card-heading"><h3>{label}</h3>{expediente && <button type="button" className="add-person-button" onClick={() => { setDialog(true); setError(''); setQuery('') }}>＋ Agregar</button>}{!expediente && <button type="button" className="primary" onClick={() => { setDialog(true); setError('') }}>＋ Crear {role === 'denunciantes' ? 'denunciante' : 'denunciado'}</button>}</div>{error && !dialog && <p className="api-error" role="alert">{error}</p>}{message && <p className="api-success" role="status">{message}</p>}<div className="people-list-wrap"><div className="people-list-heading"><h4>{expediente ? 'Participantes activos' : 'Personas registradas'}</h4><span>{expediente ? active.length : people.length}</span></div><label className="people-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar ${label.toLowerCase()}...`} aria-label={`Buscar ${label.toLowerCase()}`}/></label>{loading ? <p role="status">Cargando personas...</p> : expediente ? active.length ? <ul className="case-people-list">{active.filter(item => item.participant.name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')) || String(item.participant.id).includes(query.trim())).map(item => <li key={item.id}><span className="person-avatar">{item.participant.name.slice(0,1).toUpperCase()}</span><div><strong>{item.participant.name}</strong><small>Persona #{item.participant.id}</small></div><button className="remove-person-button" disabled={busy} onClick={() => void remove(item.participant.id)} aria-label={`Quitar ${item.participant.name}`} title="Quitar del expediente">×</button></li>)}</ul> : <p className="detail-empty">No hay {role} activos.</p> : searchable.length ? <ul className="people-list">{searchable.map(person => <li key={person.id}><span>{person.name}</span><small>ID {person.id}</small></li>)}</ul> : <p className="detail-empty">{people.length ? 'No se encontraron coincidencias.' : 'No hay personas registradas.'}</p>}</div>{dialog && <div className="person-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDialog(false) }}><section className="person-dialog person-create-dialog" role="dialog" aria-modal="true" aria-labelledby={`participant-dialog-${role}`}><div className="person-dialog-heading"><div><p className="eyebrow">{expediente ? `EXPEDIENTE ${expediente.code || `#${expediente.id}`}` : 'REGISTRO DE PERSONAS'}</p><h2 id={`participant-dialog-${role}`}>{expediente ? `Agregar ${label.toLowerCase()}` : `Crear ${role === 'denunciantes' ? 'denunciante' : 'denunciado'}`}</h2><p>{expediente ? 'Selecciona una persona registrada para vincularla al expediente.' : 'Registra una persona para que esté disponible en los expedientes.'}</p></div><button type="button" className="secondary" onClick={() => setDialog(false)} disabled={busy} aria-label="Cerrar diálogo">×</button></div><div className="participant-dialog-content">{error && <p className="api-error" role="alert">{error}</p>}{expediente ? <><label className="people-search dialog-search"><span aria-hidden="true">⌕</span><input type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar ${label.toLowerCase()} disponibles...`} aria-label={`Buscar ${label.toLowerCase()} disponibles`}/></label><h4>Personas disponibles <span>{searchable.length}</span></h4>{loading ? <p role="status">Cargando personas...</p> : searchable.length ? <ul className="dialog-person-list">{searchable.map(person => <li key={person.id}><span className="person-avatar">{person.name.slice(0,1).toUpperCase()}</span><span><strong>{person.name}</strong><small>ID {person.id}</small></span><button type="button" className="secondary" disabled={busy} onClick={() => void associate(person.id)}>Agregar</button></li>)}</ul> : <p className="detail-empty">{available.length ? 'No se encontraron coincidencias.' : 'No hay más personas disponibles.'}</p>}</> : <form className="create-person-form" onSubmit={create}><label htmlFor={`create-${role}-name`}>Nombre completo</label><input id={`create-${role}-name`} value={name} onChange={event => setName(event.target.value)} maxLength={255} required autoFocus placeholder="Ej. María Pérez" disabled={busy}/><div className="case-create-actions"><button type="button" className="secondary" onClick={() => setDialog(false)} disabled={busy}>Cancelar</button><button className="primary" disabled={busy || !name.trim()}>{busy ? 'Guardando...' : 'Crear persona'}</button></div></form>}</div></section></div>}</section>
}
function DocumentsPanel({ expedienteId }: { expedienteId: number }) {
  const [items, setItems] = useState<CaseDocument[]>([])
  const [stages, setStages] = useState<DocumentStage[]>([])
  const [stagesLoading, setStagesLoading] = useState(true)
  const [stagesError, setStagesError] = useState('')
  const [participants, setParticipants] = useState<{ denunciantes: ActiveParticipant[]; denunciados: ActiveParticipant[] }>({ denunciantes: [], denunciados: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [dialog, setDialog] = useState(false)
  const [title, setTitle] = useState('')
  const [substageId, setSubstageId] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [createdDocumentId, setCreatedDocumentId] = useState<number | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [reviewParticipants, setReviewParticipants] = useState(false)
  useEffect(() => {
    let current = true; setLoading(true); setError('')
    Promise.all([expedientesService.documents(expedienteId), expedientesService.participants(expedienteId, 'denunciantes'), expedientesService.participants(expedienteId, 'denunciados')])
      .then(([documents, claimants, respondents]) => { if (current) { setItems(documents); setParticipants({ denunciantes: claimants, denunciados: respondents }) } })
      .catch(caught => { if (current) setError(errorMessage(caught)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [expedienteId, refresh])
  useEffect(() => {
    let current = true
    setStagesLoading(true); setStagesError('')
    expedientesService.documentStages().then(rows => { if (current) setStages(rows.filter(stage => stage.is_active !== false).map(stage => ({ ...stage, substages: stage.substages.filter(substage => substage.is_active !== false) }))) })
      .catch(caught => { if (current) setStagesError(errorMessage(caught)) }).finally(() => { if (current) setStagesLoading(false) })
    return () => { current = false }
  }, [])
  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setUploadStatus('')
    try {
      if (selectedFile && selectedFile.size > 10 * 1024 * 1024) throw new Error('El archivo supera el máximo permitido de 10 MiB.')
      const document = createdDocumentId ? null : await expedientesService.createDocument(expedienteId, { title, substage_id: Number(substageId), document_date: documentDate || undefined })
      const documentId = createdDocumentId || document!.id
      if (selectedFile) {
        setCreatedDocumentId(documentId); setUploadStatus('Subiendo archivo a R2...')
        await expedientesService.uploadDocumentFile(documentId, selectedFile)
        setUploadStatus('Archivo cargado y confirmado.')
      }
      setTitle(''); setSubstageId(''); setDocumentDate(''); setSelectedFile(null); setCreatedDocumentId(null); setUploadStatus(''); setDialog(false); setRefresh(value => value + 1)
    } catch (caught) { setError(errorMessage(caught)) } finally { setSaving(false) }
  }
  const documentGroups: { key: string | number; name: string; sortOrder?: number; items: CaseDocument[] }[] = []
  items.forEach(item => {
    const stage = item.stage || item.substage?.stage
    const name = stage?.name || 'Etapa sin nombre'
    const key = stage?.id ?? name
    const last = documentGroups[documentGroups.length - 1]
    if (last?.key === key) last.items.push(item)
    else documentGroups.push({ key, name, sortOrder: stage?.sort_order, items: [item] })
  })
  return <section className="documents-panel"><div className="detail-panel-heading"><div><p className="eyebrow">ARCHIVO DEL EXPEDIENTE</p><h3>Documentos</h3></div><div className="documents-actions"><button className="secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Actualizar</button><button className="primary" onClick={() => { setDialog(true); setError('') }}>+ Crear documento</button></div></div>{error && <p className="api-error" role="alert">{error}</p>}{loading ? <p className="detail-empty" role="status">Cargando documentos…</p> : items.length ? <div className="document-groups">{documentGroups.map((group, groupIndex) => <section className={`document-stage-group stage-color-${group.sortOrder ?? groupIndex + 1}`} key={`${group.key}-${groupIndex}`}><header className="document-stage-heading"><span className="document-stage-index">{String(group.sortOrder ?? groupIndex + 1).padStart(2, '0')}</span><div><small>ETAPA</small><h4>{group.name}</h4></div><span className="document-stage-count">{group.items.length} {group.items.length === 1 ? 'documento' : 'documentos'}</span></header><ul className="document-stage-list">{group.items.map(item => <li key={item.id}><span className="document-symbol">?</span><div className="document-entry-content"><strong>{item.title}</strong><div className="document-entry-meta">{item.substage?.name && <span className="document-substage-tag">{item.substage.name}</span>}{item.document_date && <span className="document-date-tag">{item.document_date}</span>}{item.status && <span className="document-status-tag">{item.status}</span>}</div>{((item.denunciantes?.length || 0) + (item.denunciados?.length || 0)) > 0 && <small className="document-participants-line">{[...(item.denunciantes || []), ...(item.denunciados || [])].map(person => person.name).join(', ')}</small>}</div>{item.file_url?.startsWith('https://') && <a className="secondary" href={item.file_url} target="_blank" rel="noopener noreferrer">Ver archivo ?</a>}</li>)}</ul></section>)}</div> : <div className="documents-empty"><span>?</span><h4>Sin documentos registrados</h4><p>Los documentos de este expediente aparecerán aquí.</p><button className="primary" onClick={() => setDialog(true)}>Crear documento</button></div>}{dialog && <div className="person-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setDialog(false) }}><section className="person-dialog document-create-dialog" role="dialog" aria-modal="true" aria-labelledby="document-dialog-title"><div className="person-dialog-heading"><div><p className="eyebrow">EXPEDIENTE #{expedienteId}</p><h2 id="document-dialog-title">Crear documento</h2><p>Registra un documento en una subetapa activa.</p></div><button type="button" className="secondary" disabled={saving} onClick={() => setDialog(false)} aria-label="Cerrar diálogo">×</button></div><form className="document-create-form" onSubmit={create}><div><label htmlFor="document-title">Título</label><input id="document-title" required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ej. Resolución de calificación" disabled={!!createdDocumentId}/></div><div className="document-form-row"><div><label htmlFor="document-substage">Subetapa activa</label><select id="document-substage" required value={substageId} onChange={event => setSubstageId(event.target.value)} disabled={!!createdDocumentId || stagesLoading || !!stagesError || !stages.some(stage => stage.substages.length)}><option value="">{stagesLoading ? 'Cargando etapas...' : stagesError ? 'No se pudieron cargar las etapas' : 'Selecciona una subetapa'}</option>{stages.map(stage => stage.substages.length > 0 && <optgroup key={stage.id} label={stage.name}>{stage.substages.map(substage => <option key={substage.id} value={substage.id}>{substage.name}</option>)}</optgroup>)}</select>{stagesError && <small className="document-stage-error">{stagesError}</small>}</div><div><label htmlFor="document-date">Fecha del documento</label><input id="document-date" type="date" value={documentDate} onChange={event => setDocumentDate(event.target.value)} disabled={!!createdDocumentId}/></div></div><div><label htmlFor="document-file">Archivo <span>(opcional · PNG, JPEG, WebP o GIF · máximo 10 MiB)</span></label><input id="document-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => setSelectedFile(event.currentTarget.files?.[0] || null)}/>{selectedFile && <small className="document-selected-file">{selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MiB</small>}{createdDocumentId && <small className="document-stage-error">El documento ya se creó. Selecciona el archivo para reintentar la carga.</small>}{uploadStatus && <small className="document-upload-status" role="status">{uploadStatus}</small>}</div><aside className="document-participants-warning"><strong>ESTE DOCUMENTO PROCEDE AL CASO DONDE TANTOS LOS DENUNCIANTES Y DENUNCIADOS SON ELLOS, REVISA PORFAVOR</strong><button type="button" className="review-participants-button" disabled={loading} onClick={() => setReviewParticipants(true)}>{loading ? 'Cargando participantes…' : 'Revisar participantes'}</button></aside>{error && <p className="api-error" role="alert">{error}</p>}<div className="case-create-actions"><button type="button" className="secondary" disabled={saving} onClick={() => { setDialog(false); setError('') }}>Cancelar</button><button className="primary" disabled={saving || (createdDocumentId !== null && !selectedFile) || (!createdDocumentId && (stagesLoading || !!stagesError || !stages.some(stage => stage.substages.length)))}>{saving ? (selectedFile ? 'Subiendo…' : 'Guardando…') : createdDocumentId ? 'Reintentar subida' : 'Crear documento'}</button></div></form></section></div>}{reviewParticipants && <div className="person-dialog-backdrop review-participants-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setReviewParticipants(false) }}><section className="person-dialog participants-review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-participants-title"><div className="person-dialog-heading"><div><p className="eyebrow">EXPEDIENTE #{expedienteId}</p><h2 id="review-participants-title">Participantes del caso</h2><p>Estas personas se asociarán automáticamente al documento.</p></div><button type="button" className="secondary" onClick={() => setReviewParticipants(false)} aria-label="Cerrar diálogo">×</button></div><div className="review-participants-grid"><section><h3>Denunciantes <span>{participants.denunciantes.length}</span></h3>{participants.denunciantes.length ? <ul>{participants.denunciantes.map(item => <li key={item.id}><span className="person-avatar">{item.participant.name.slice(0,1).toUpperCase()}</span><div><strong>{item.participant.name}</strong><small>ID {item.participant.id}</small></div></li>)}</ul> : <p>No hay denunciantes activos en este expediente.</p>}</section><section><h3>Denunciados <span>{participants.denunciados.length}</span></h3>{participants.denunciados.length ? <ul>{participants.denunciados.map(item => <li key={item.id}><span className="person-avatar">{item.participant.name.slice(0,1).toUpperCase()}</span><div><strong>{item.participant.name}</strong><small>ID {item.participant.id}</small></div></li>)}</ul> : <p>No hay denunciados activos en este expediente.</p>}</section></div></section></div>}</section>
}

function CaseDetail({ file: initialFile, onBack }: { file: CaseFile; onBack: () => void }) {
  const [file, setFile] = useState(initialFile)
  const statusOptions = [{ value: 'OPEN', label: 'Abierto' }, { value: 'IN_PROGRESS', label: 'En proceso' }, { value: 'CLOSED', label: 'Cerrado' }]
  const normalizeStatus = (value?: string) => statusOptions.some(option => option.value === value) ? value! : 'OPEN'
  const [status, setStatus] = useState(normalizeStatus(initialFile.status))
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusError, setStatusError] = useState('')
  useEffect(() => { setFile(initialFile); setStatus(normalizeStatus(initialFile.status)) }, [initialFile])
  async function updateStatus(event: FormEvent) {
    event.preventDefault(); const next = status; setSavingStatus(true); setStatusError(''); setStatusMessage('')
    try { const updated = await expedientesService.updateStatus(file.id, next); setFile(current => ({ ...current, ...updated })); setStatus(updated.status || next); setStatusMessage('Estado actualizado.') }
    catch (caught) { setStatusError(errorMessage(caught)) } finally { setSavingStatus(false) }
  }
  const parsed = file.opening_date ? new Date(file.opening_date + 'T00:00:00') : null
  const formattedDate = parsed && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(parsed) : 'No disponible'
  return <><button className="secondary" onClick={onBack}>← Volver a expedientes</button><section className="case-summary"><div className="case-summary-main"><p className="eyebrow">EXPEDIENTE</p><h2>{file.code || 'ID ' + file.id}</h2><dl><div><dt>Nombre</dt><dd>{file.name || 'Sin nombre registrado'}</dd></div><div><dt>Tipo de inicio</dt><dd>{initiationTypes[file.init_type as InitiationType] || file.init_type}</dd></div>{file.created_at && <div><dt>Creado en sistema</dt><dd>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(file.created_at))}</dd></div>}</dl></div><div className="case-summary-date"><p>Fecha de apertura</p><strong>{formattedDate}</strong><form className="case-status-form" onSubmit={updateStatus}><label htmlFor="case-status">Estado</label><select id="case-status" value={status} onChange={event => setStatus(event.target.value)}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button className="secondary" disabled={savingStatus || !status}>{savingStatus ? 'Guardando…' : 'Actualizar estado'}</button></form>{statusMessage && <p className="api-success" role="status">{statusMessage}</p>}{statusError && <p className="api-error" role="alert">{statusError}</p>}</div></section><div className="case-detail-layout"><DocumentsPanel expedienteId={file.id}/><aside className="case-participants"><PeoplePanel expediente={file} role="denunciantes"/><PeoplePanel expediente={file} role="denunciados"/></aside></div></>
}

export default function Management({ view, initialFile = null }: { view: 'expedientes' | 'personas'; initialFile?: CaseFile | null }) {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [offset, setOffset] = useState(0)
  const [active, setActive] = useState<CaseFile | null>(initialFile)
  const [initType, setInitType] = useState<InitiationType>('DENUNCIA_DE_PARTE')
  const [caseName, setCaseName] = useState('')
  const [openingDate, setOpeningDate] = useState('')
  const [createDialog, setCreateDialog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setFiles(await expedientesService.list(pageSize, offset)) } catch (caught) { setError(errorMessage(caught)); setFiles([]) } finally { setLoading(false) } }, [offset])
  useEffect(() => { void load() }, [load])
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const created = await expedientesService.create({ name: caseName, opening_date: openingDate, init_type: initType }); setCaseName(''); setOpeningDate(''); setCreateDialog(false); setActive(created); if (offset === 0) await load(); else setOffset(0) }
    catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  return <section className="management" id="gestion">{(!active || view === 'personas') && <div className="page-heading"><div><p className="eyebrow">ESPACIO DE TRABAJO</p><h1>{view === 'personas' ? 'Registro de personas' : 'Expedientes'}</h1><p>{view === 'personas' ? 'Administra el registro de denunciantes y denunciados.' : 'Crea expedientes y gestiona sus participantes.'}</p></div></div>}{view === 'personas' ? <div className="management-grid"><PeoplePanel role="denunciantes"/><PeoplePanel role="denunciados"/></div> : active ? <CaseDetail key={active.id} file={active} onBack={() => { setActive(null); void load() }}/> : <>{error && <p className="api-error" role="alert">{error}</p>}<div className="panel-heading"><h3>Expedientes registrados</h3><div className="case-list-actions"><button className="primary" onClick={() => setCreateDialog(true)}>＋ Crear expediente</button><button className="secondary" disabled={loading || busy} onClick={() => void load()}>Actualizar</button></div></div>{loading ? <p role="status">Cargando expedientes…</p> : files.length ? <div className="table-scroll"><table><thead><tr><th>Código</th><th>Nombre</th><th>Fecha de apertura</th><th>Tipo de inicio</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{files.map(file => <tr key={file.id}><td>{file.code || `ID ${file.id}`}</td><td>{file.name || 'Sin nombre'}</td><td>{file.opening_date || 'Sin fecha'}</td><td>{initiationTypes[file.init_type as InitiationType] || file.init_type}</td><td><span className="status">{file.status === 'OPEN' ? 'Abierto' : file.status || 'Sin estado'}</span></td><td><button className="secondary" onClick={() => setActive(file)}>Abrir →</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No hay expedientes</h3><p>Crea el primero para comenzar.</p><button className="primary" onClick={() => setCreateDialog(true)}>Crear expediente</button></div>}<div className="pagination"><button className="secondary" disabled={offset === 0 || loading || busy} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Anterior</button><span>Página {offset / pageSize + 1}</span><button className="secondary" disabled={files.length < pageSize || loading || busy} onClick={() => setOffset(offset + pageSize)}>Siguiente</button></div>{createDialog && <div className="person-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setCreateDialog(false) }}><section className="person-dialog case-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-case-title"><div className="person-dialog-heading"><div><p className="eyebrow">EXPEDIENTES</p><h2 id="create-case-title">Crear expediente</h2><p>Completa los datos del expediente.</p></div><button type="button" className="secondary" disabled={busy} onClick={() => setCreateDialog(false)} aria-label="Cerrar diálogo">×</button></div><form className="case-create-form" onSubmit={create}><div><label htmlFor="case-name">Nombre del expediente</label><input id="case-name" value={caseName} onChange={event => setCaseName(event.target.value)} required maxLength={255} disabled={busy} placeholder="Ej. Caso de ejemplo"/></div><div><label htmlFor="opening-date">Fecha de apertura</label><input id="opening-date" type="date" value={openingDate} onChange={event => setOpeningDate(event.target.value)} required disabled={busy}/></div><div><label htmlFor="init-type">Tipo de inicio</label><select id="init-type" value={initType} onChange={event => setInitType(event.target.value as InitiationType)} disabled={busy}>{Object.entries(initiationTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{error && <p className="api-error" role="alert">{error}</p>}<div className="case-create-actions"><button type="button" className="secondary" onClick={() => setCreateDialog(false)} disabled={busy}>Cancelar</button><button className="primary" disabled={busy || !caseName.trim() || !openingDate}>{busy ? 'Creando…' : 'Crear expediente'}</button></div></form></section></div>}</>}</section>
}
