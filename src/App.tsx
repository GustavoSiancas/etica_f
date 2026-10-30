import { useEffect, useState } from 'react'
import Management from './components/Management'
import CaseRow from './components/CaseRow'
import { expedientesService, formatCaseNumber, initiationTypes, locationLabel, statusLabel } from './services/api'
import type { CaseFile, InitiationType, Role } from './services/api'
import './App.css'
import AppearancePicker from './components/AppearancePicker'
import './themes.css'
import './workspace.css'
import './modern.css'
import './components/CaseDocuments.css'
import './components/CaseCreateDialog.css'
import './components/ParticipantProfile.css'

type View = 'dashboard' | 'expedientes' | 'personas'
const views = [{ id: 'dashboard', label: 'Dashboard', icon: 'grid' }, { id: 'expedientes', label: 'Expedientes', icon: 'folder' }, { id: 'personas', label: 'Personas', icon: 'users' }] as const
function Icon({ name }: { name: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'document' ? <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h6M8 13h8M8 17h8"/></> : name === 'chevron' ? <path d="m7 10 5 5 5-5"/> : name === 'upload' ? <><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M5 14v5h14v-5"/></> : name === 'grid' ? <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></> : name === 'folder' ? <path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/> : <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>}</svg>
}
function Dashboard({ navigate, open, create }: { navigate: (view: View) => void; open: (file: CaseFile) => void; create: () => void }) {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [totals, setTotals] = useState({ all: 0, open: 0, closed: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    // El total de cada consulta ya viene filtrado por el backend.
    Promise.all([expedientesService.page(5, 0), expedientesService.page(1, 0, { status: 'ABIERTO' }), expedientesService.page(1, 0, { status: 'CERRADO' })])
      .then(([recent, opened, closed]) => { if (!cancelled) { setFiles(recent.data); setTotals({ all: recent.total, open: opened.total, closed: closed.total }) } })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : 'No se pudo cargar el resumen.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refresh])
  const value = (count: number) => loading ? '…' : error ? '—' : count
  return <>
    <div className="page-heading"><div><h1>Dashboard</h1><p>Tu espacio de trabajo para la gestión de Ética CAL.</p></div><button className="primary" onClick={create}>＋ Nuevo expediente</button></div>
    <div className="summary-grid summary-grid-4">
      <article className="summary-card"><span className="summary-icon"><Icon name="folder"/></span><p>Total de expedientes</p><strong>{value(totals.all)}</strong><small>Registrados en el sistema</small></article>
      <article className="summary-card"><span className="summary-icon green"><Icon name="grid"/></span><p>Abiertos</p><strong>{value(totals.open)}</strong><small>En trámite actualmente</small></article>
      <article className="summary-card"><span className="summary-icon muted"><Icon name="document"/></span><p>Cerrados</p><strong>{value(totals.closed)}</strong><small>Concluidos</small></article>
      <button className="summary-card quick-card" onClick={() => navigate('personas')}><span className="summary-icon"><Icon name="users"/></span><p>Registro de personas</p><h3>Gestionar participantes <span>↗</span></h3><small>Denunciantes y denunciados</small></button>
    </div>
    <section className="dashboard-table">
      <div className="panel-heading"><div><h2>Últimos expedientes</h2><p>Los registros más recientes del sistema.</p></div><button className="secondary" disabled={loading} onClick={() => setRefresh(refresh + 1)}>↻ Actualizar</button></div>
      {error ? <div className="api-error" role="alert">{error}</div> : loading ? <div className="empty-state" role="status">Cargando expedientes…</div> : files.length ? <div className="table-scroll"><table><thead><tr><th>Expediente</th><th>Tipo de inicio</th><th>Ubicación</th><th>Estado</th></tr></thead><tbody>{files.map(file => <CaseRow key={file.id} file={file} onOpen={open}><td><strong>{formatCaseNumber(file.number)}</strong></td><td>{initiationTypes[file.init_type as InitiationType] || file.init_type}</td><td>{locationLabel(file.location)}</td><td><span className="status" data-status={file.status}>{statusLabel(file.status)}</span></td></CaseRow>)}</tbody></table></div> : <div className="empty-state"><Icon name="folder"/><h3>Aún no hay expedientes</h3><p>Crea el primer expediente para comenzar a trabajar.</p><button className="primary" onClick={create}>Crear expediente</button></div>}
      <div className="table-footer"><span>Mostrando los 5 expedientes más recientes</span><button className="row-link" onClick={() => navigate('expedientes')}>Ver todos los expedientes →</button></div>
    </section>
  </>
}
export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [peopleRole, setPeopleRole] = useState<Role>('denunciantes')
  const [peopleExpanded, setPeopleExpanded] = useState(false)
  const [menu, setMenu] = useState(false)
  const [file, setFile] = useState<CaseFile | null>(null)
  // Cada clic en el menú reinicia la sección (sale de fichas o detalles abiertos).
  const [navCount, setNavCount] = useState(0)
  const [startCreating, setStartCreating] = useState(false)
  function navigate(next: View) { setView(next); if (next === 'personas') setPeopleExpanded(true); setMenu(false); setFile(null); setStartCreating(false); setNavCount(value => value + 1) }
  function createCase() { navigate('expedientes'); setStartCreating(true) }
  return <div className="app-shell">{menu && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMenu(false)}/>}<aside className={`sidebar ${menu ? 'is-open' : ''}`}><a className="app-brand" href="#" onClick={event => { event.preventDefault(); navigate('dashboard') }}><span className="brand-symbol">E<span>•</span></span><span>ÉTICA CAL<small>SISTEMA DE GESTIÓN</small></span></a><p className="nav-label">ESPACIO DE TRABAJO</p><nav aria-label="Navegación principal">{views.filter(item => item.id !== 'personas').map(item => <button key={item.id} className={view === item.id ? 'selected' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon}/>{item.label}{view === item.id && <span className="nav-dot"/>}</button>)}<button className={view === 'personas' ? 'selected' : ''} aria-expanded={peopleExpanded} aria-controls="personas-subnav" onClick={() => { if (view !== 'personas') navigate('personas'); else setPeopleExpanded(!peopleExpanded) }}><Icon name="users"/>Personas<span className="nav-chevron"><Icon name="chevron"/></span></button>{peopleExpanded && <div className="sidebar-subnav" id="personas-subnav">{(['denunciantes', 'denunciados'] as Role[]).map(role => <button key={role} className={view === 'personas' && peopleRole === role ? 'selected' : ''} aria-current={view === 'personas' && peopleRole === role ? 'page' : undefined} onClick={() => { setPeopleRole(role); navigate('personas') }}>{role === 'denunciantes' ? 'Denunciantes' : 'Denunciados'}</button>)}</div>}</nav><div className="sidebar-bottom"><span className="workspace-avatar">EC</span><div><strong>Ética CAL</strong><small>Gestión interna</small></div></div></aside><div className="app-main"><header className="topbar"><div><button className="mobile-menu" aria-label="Abrir menú" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button><span className="breadcrumb">Ética CAL <span>/</span> <strong>{view === 'personas' ? (peopleRole === 'denunciantes' ? 'Denunciantes' : 'Denunciados') : views.find(item => item.id === view)?.label}</strong></span></div><AppearancePicker/></header><main className="workspace-content">{view === 'dashboard' ? <Dashboard navigate={navigate} create={createCase} open={selected => { setFile(selected); setView('expedientes') }}/> : <Management key={`${view}-${navCount}`} view={view} initialFile={file} peopleRole={peopleRole} startCreating={startCreating}/>}</main><footer className="app-footer"><span>Ética CAL · Sistema de gestión</span><span>Gestión de expedientes</span></footer></div></div>
}


