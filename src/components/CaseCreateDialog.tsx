import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { expedientesService, initiationTypes } from '../services/api'
import ParticipantPicker from './ParticipantPicker'
import type { CaseFile, InitiationType, Person, Role } from '../services/api'

const roles: { id: Role; label: string; hint: string }[] = [
  { id: 'denunciantes', label: 'Denunciantes', hint: 'Quienes presentan la denuncia' },
  { id: 'denunciados', label: 'Denunciados', hint: 'Colegiados denunciados' },
]

// Fecha de hoy en hora de Lima, en formato YYYY-MM-DD (en-CA usa ese formato).
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function CaseCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (file: CaseFile) => void }) {
  const [step, setStep] = useState(1)
  const [tab, setTab] = useState<Role>('denunciantes')
  const [description, setDescription] = useState('')
  const [openingDate, setOpeningDate] = useState(today)
  const [initType, setInitType] = useState<InitiationType | ''>('')
  const [selected, setSelected] = useState<Record<Role, Person[]>>({ denunciantes: [], denunciados: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Aviso antes de crear sin denunciantes y/o sin denunciados (se permite, pero no es lo habitual).
  const [confirmMissing, setConfirmMissing] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      if (confirmMissing) setConfirmMissing(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose, confirmMissing])
  const noDenunciantes = selected.denunciantes.length === 0
  const noDenunciados = selected.denunciados.length === 0
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!initType) { setStep(1); return }
    if (step === 1) { setStep(2); return }
    if (noDenunciantes || noDenunciados) { setConfirmMissing(true); return }
    await create()
  }
  async function create() {
    setConfirmMissing(false)
    setBusy(true); setError('')
    try {
      const file = await expedientesService.create({ description, opening_date: openingDate, init_type: initType as InitiationType, denunciante_ids: selected.denunciantes.map(person => person.id), denunciado_ids: selected.denunciados.map(person => person.id) })
      onCreated(file)
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo completar el expediente.') }
    finally { setBusy(false) }
  }
  const add = (role: Role) => (person: Person) => setSelected(current => ({ ...current, [role]: current[role].some(item => item.id === person.id) ? current[role] : [...current[role], person] }))
  const remove = (role: Role) => (id: number) => setSelected(current => ({ ...current, [role]: current[role].filter(person => person.id !== id) }))
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return <div className="person-dialog-backdrop"><section className={`person-dialog case-create-dialog cc-dialog${step === 2 ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="create-case-title">
    <div className="person-dialog-heading cc-heading">
      <div>
        <h2 id="create-case-title">Crear expediente</h2>
        <ol className="cc-steps" aria-label="Pasos">
          <li className={step === 1 ? 'is-current' : 'is-done'} aria-current={step === 1 ? 'step' : undefined}><span>{step > 1 ? '✓' : '1'}</span>Datos</li>
          <li className={step === 2 ? 'is-current' : ''} aria-current={step === 2 ? 'step' : undefined}><span>2</span>Participantes</li>
        </ol>
      </div>
      <button type="button" className="secondary" disabled={busy} onClick={onClose} aria-label="Cerrar diálogo">×</button>
    </div>
    <form className="case-create-form cc-form" onSubmit={submit}>
      {step === 1 ? <div className="cc-body">
        <div className="cc-row">
          <div><label htmlFor="opening-date">Fecha de apertura <b>*</b></label><input id="opening-date" type="date" required value={openingDate} onChange={event => setOpeningDate(event.target.value)}/></div>
          <div><label htmlFor="init-type">Tipo de inicio <b>*</b></label><select id="init-type" required value={initType} className={initType ? undefined : 'is-placeholder'} onChange={event => setInitType(event.target.value as InitiationType)}><option value="" disabled>Selecciona el tipo de inicio</option>{Object.entries(initiationTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        <div><label htmlFor="case-description">Descripción <span>(opcional)</span></label><textarea id="case-description" rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Resumen breve del caso"/></div>
      </div> : <div className="cc-body cc-participants">
        <div className="cc-tabs" role="tablist" aria-label="Tipo de participante">
          {roles.map(role => <button key={role.id} type="button" role="tab" id={`cc-tab-${role.id}`} aria-controls={`cc-panel-${role.id}`} aria-selected={tab === role.id} className={tab === role.id ? 'is-active' : ''} onClick={() => setTab(role.id)}>
            <span className="cc-tab-text"><strong>{role.label}</strong><small>{role.hint}</small></span>
            <span className={`cc-tab-count${selected[role.id].length ? ' has-items' : ''}`}>{selected[role.id].length}</span>
          </button>)}
        </div>
        {/* Ambos paneles quedan montados para conservar la búsqueda al cambiar de pestaña. */}
        {roles.map(role => <div key={role.id} role="tabpanel" id={`cc-panel-${role.id}`} aria-labelledby={`cc-tab-${role.id}`} hidden={tab !== role.id} className="cc-panel">
          <ParticipantPicker role={role.id} selected={selected[role.id]} disabled={busy} onAdd={add(role.id)} onRemove={remove(role.id)}/>
        </div>)}
      </div>}
      {error && <p className="api-error cc-error" role="alert">{error}</p>}
      <div className="case-create-actions cc-footer">
        <span className="cc-summary">{step === 2 ? <>{count(selected.denunciantes.length, 'denunciante', 'denunciantes')} · {count(selected.denunciados.length, 'denunciado', 'denunciados')}</> : 'Paso 1 de 2'}</span>
        <div>
          {step === 2 ? <button type="button" className="secondary" disabled={busy} onClick={() => setStep(1)}>← Anterior</button> : <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button>}
          <button className="primary" disabled={busy || (step === 1 && (!openingDate || !initType))}>{busy ? 'Creando…' : step === 1 ? 'Siguiente: participantes →' : 'Crear expediente'}</button>
        </div>
      </div>
    </form>
    {confirmMissing && <div className="cc-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmMissing(false) }}>
      <div className="cc-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cc-confirm-title" aria-describedby="cc-confirm-text">
        <span className="cc-confirm-icon" aria-hidden="true">!</span>
        <h3 id="cc-confirm-title">{noDenunciantes && noDenunciados ? 'Expediente sin participantes' : noDenunciantes ? 'Expediente sin denunciantes' : 'Expediente sin denunciados'}</h3>
        <p id="cc-confirm-text">
          ¿Estás seguro de crear este expediente sin {noDenunciantes && noDenunciados ? 'denunciantes ni denunciados' : noDenunciantes ? 'denunciantes' : 'denunciados'}?
          {' '}Se puede hacer, pero no es lo recomendado.
        </p>
        <div className="cc-confirm-actions">
          <button type="button" className="secondary" autoFocus onClick={() => { setConfirmMissing(false); setTab(noDenunciantes ? 'denunciantes' : 'denunciados') }}>
            Volver y agregar
          </button>
          <button type="button" className="primary cc-confirm-go" onClick={() => void create()}>Sí, crear de todos modos</button>
        </div>
      </div>
    </div>}
  </section></div>
}
