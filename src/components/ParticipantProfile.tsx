import { useEffect, useState } from 'react'
import { expedientesService, formatCal, formatCaseNumber, formatPeruDay, initiationTypes, statusLabel } from '../services/api'
import type { CaseFile, CaseFilters, InitiationType, Person, Role } from '../services/api'
import CaseRow from './CaseRow'

const pageSize = 20
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudieron consultar los expedientes.'
const emptyFilters = { from: '', to: '' }

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
const formatDate = (value?: string | null) => formatPeruDay(value) || 'Sin fecha'

export default function ParticipantProfile({ role, person, onBack, onOpenCase }: { role: Role; person: Person; onBack: () => void; onOpenCase: (file: CaseFile) => void }) {
  const singular = role === 'denunciantes' ? 'Denunciante' : 'Denunciado'
  const [filters, setFilters] = useState(emptyFilters)
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState<{ data: CaseFile[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Total de expedientes del participante (sin filtros). El estado ahora es de cada carpeta.
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let current = true
    expedientesService.byParticipant(role, person.id, 1, 0)
      .then(result => { if (current) setCount(result.total) })
      .catch(() => { if (current) setCount(null) })
    return () => { current = false }
  }, [role, person.id, refresh])

  useEffect(() => {
    let current = true
    setLoading(true); setError('')
    const query: CaseFilters = { from: filters.from, to: filters.to }
    expedientesService.byParticipant(role, person.id, pageSize, offset, query)
      .then(result => { if (current) setPage(result) })
      .catch(caught => { if (current) { setError(errorMessage(caught)); setPage(null) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [role, person.id, offset, filters, refresh])

  const update = (patch: Partial<typeof emptyFilters>) => { setOffset(0); setFilters(current => ({ ...current, ...patch })) }
  const filtered = filters.from !== '' || filters.to !== ''
  const rangeError = filters.from && filters.to && filters.from > filters.to

  return <div className="profile">
    <button className="secondary" onClick={onBack}>← Volver a {role}</button>

    <section className="profile-hero">
      <span className={`profile-avatar is-${role}`} aria-hidden="true">{initials(person.name)}</span>
      <div className="profile-identity">
        <span className={`profile-role is-${role}`}>{singular}</span>
        <h1>{person.name}</h1>
        <dl className="profile-facts">
          <div><dt>{person.document_type || 'Documento'}</dt><dd>{person.document_number || 'Sin número'}</dd></div>
          {person.registration_number != null && <div><dt>CAL</dt><dd>{formatCal(person.registration_number)}</dd></div>}
          <div><dt>ID interno</dt><dd>{person.id}</dd></div>
        </dl>
      </div>
      <div className="profile-stats">
        <button type="button" className="is-active" onClick={() => { setOffset(0); setFilters(emptyFilters) }}><strong>{count ?? '—'}</strong><span>Expedientes</span></button>
      </div>
    </section>

    <section className="dashboard-table profile-cases">
      <div className="panel-heading profile-toolbar">
        <div><h2>Expedientes de {person.name.split(/\s+/)[0]}</h2><p>Más recientes primero</p></div>
        <div className="profile-filters">
          <div className={`profile-range${rangeError ? ' is-invalid' : ''}`} role="group" aria-label="Fecha de apertura">
            <label><span>Desde</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={event => update({ from: event.target.value })}/></label>
            <label><span>Hasta</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={event => update({ to: event.target.value })}/></label>
          </div>
          {filtered && <button type="button" className="row-link" onClick={() => { setOffset(0); setFilters(emptyFilters) }}>Limpiar</button>}
        </div>
      </div>
      {error && <p className="api-error profile-error" role="alert">{error} <button type="button" className="row-link" onClick={() => setRefresh(n => n + 1)}>Reintentar</button></p>}
      {loading && !page ? <div className="empty-state" role="status">Cargando expedientes…</div>
        : page && page.data.length ? <div className={`table-scroll${loading ? ' is-refreshing' : ''}`}><table>
          <thead><tr><th>Expediente</th><th>Fecha de apertura</th><th>Tipo de inicio</th><th>Estado</th><th aria-label="Abrir"/></tr></thead>
          <tbody>{page.data.map(file => <CaseRow key={file.id} file={file} onOpen={onOpenCase}>
            <td><strong>{formatCaseNumber(file.number)}</strong>{file.description && <small className="profile-case-desc">{file.description}</small>}</td>
            <td>{formatDate(file.opening_date)}</td>
            <td>{file.init_type ? initiationTypes[file.init_type as InitiationType] || file.init_type : 'Sin tipo'}</td>
            <td><span className="status" data-status={file.status}>{statusLabel(file.status)}</span></td>
            <td className="profile-open">Ver →</td>
          </CaseRow>)}</tbody>
        </table></div>
        : !error && page && <div className="empty-state">{filtered
          ? <><h3>Sin resultados</h3><p>Ningún expediente de esta persona coincide con los filtros.</p><button className="secondary" onClick={() => { setOffset(0); setFilters(emptyFilters) }}>Limpiar filtros</button></>
          : <><h3>Sin expedientes</h3><p>Esta persona aún no figura como {singular.toLowerCase()} en ningún expediente.</p></>}</div>}
      {page && page.total > 0 && <div className="table-footer"><span>{page.data.length ? `${offset + 1}–${offset + page.data.length}` : 0} de {page.total}</span><div><button className="secondary" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Anterior</button><button className="secondary" disabled={loading || offset + pageSize >= page.total} onClick={() => setOffset(offset + pageSize)}>Siguiente</button></div></div>}
    </section>
  </div>
}
