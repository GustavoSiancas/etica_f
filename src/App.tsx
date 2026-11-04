import { useEffect, useState } from 'react'
import Management from './components/Management'
import FolderTypesAdmin from './components/FolderTypesAdmin'
import FoldersList from './components/FoldersList'
import {
  expedientesService,
  folderName,
  foldersService,
  formatCaseNumber,
  locationLabel,
  statusLabel,
} from './services/api'
import type { GlobalFolder, Role } from './services/api'
import { navigate, paths, useRoute } from './router'
import { setAltCaseView, useAltCaseView } from './caseView'
import type { Route } from './router'
import './App.css'
import AppearancePicker from './components/AppearancePicker'
import './themes.css'
import './workspace.css'
import './modern.css'
import './components/CaseDocuments.css'
import './components/CaseCreateDialog.css'
import './components/ParticipantProfile.css'

type View = 'dashboard' | 'expedientes' | 'carpetas' | 'personas'
const views = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'expedientes', label: 'Expedientes', icon: 'folder' },
  { id: 'carpetas', label: 'Carpetas', icon: 'folders' },
  { id: 'personas', label: 'Personas', icon: 'users' },
] as const
function Icon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'document' ? (
        <>
          <path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v6h6M8 13h8M8 17h8" />
        </>
      ) : name === 'chevron' ? (
        <path d="m7 10 5 5 5-5" />
      ) : name === 'upload' ? (
        <>
          <path d="M12 16V4m-4 4 4-4 4 4" />
          <path d="M5 14v5h14v-5" />
        </>
      ) : name === 'grid' ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ) : name === 'folders' ? (
        <>
          <path d="M7 7V5a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1" />
          <path d="M2 11V9a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8Z" />
        </>
      ) : name === 'folder' ? (
        <path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      ) : (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
        </>
      )}
    </svg>
  )
}
function Dashboard({
  navigate,
  open,
  create,
}: {
  navigate: (view: View) => void
  open: (folder: GlobalFolder) => void
  create: () => void
}) {
  const [folders, setFolders] = useState<GlobalFolder[]>([])
  const [totals, setTotals] = useState({ cases: 0, open: 0, closed: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    // El estado ahora es de cada carpeta: los contadores de abiertas/cerradas cuentan carpetas.
    Promise.all([
      expedientesService.page(1, 0),
      foldersService.page(5, 0),
      foldersService.page(1, 0, { status: 'ABIERTO' }),
      foldersService.page(1, 0, { status: 'CERRADO' }),
    ])
      .then(([cases, recent, opened, closed]) => {
        if (!cancelled) {
          setFolders(recent.data)
          setTotals({ cases: cases.total, open: opened.total, closed: closed.total })
        }
      })
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : 'No se pudo cargar el resumen.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])
  const value = (count: number) => (loading ? '…' : error ? '—' : count)
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Tu espacio de trabajo para la gestión de Ética CAL.</p>
        </div>
        <button className="primary" onClick={create}>
          ＋ Nuevo expediente
        </button>
      </div>
      <div className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span className="summary-icon">
            <Icon name="folder" />
          </span>
          <p>Total de expedientes</p>
          <strong>{value(totals.cases)}</strong>
          <small>Registrados en el sistema</small>
        </article>
        <article className="summary-card">
          <span className="summary-icon green">
            <Icon name="grid" />
          </span>
          <p>Carpetas abiertas</p>
          <strong>{value(totals.open)}</strong>
          <small>En trámite actualmente</small>
        </article>
        <article className="summary-card">
          <span className="summary-icon muted">
            <Icon name="document" />
          </span>
          <p>Carpetas cerradas</p>
          <strong>{value(totals.closed)}</strong>
          <small>Concluidas</small>
        </article>
        <button className="summary-card quick-card" onClick={() => navigate('personas')}>
          <span className="summary-icon">
            <Icon name="users" />
          </span>
          <p>Registro de personas</p>
          <h3>
            Gestionar participantes <span>↗</span>
          </h3>
          <small>Denunciantes y denunciados</small>
        </button>
      </div>
      <section className="dashboard-table">
        <div className="panel-heading">
          <div>
            <h2>Últimas carpetas</h2>
            <p>Las carpetas creadas más recientemente.</p>
          </div>
          <button className="secondary" disabled={loading} onClick={() => setRefresh(refresh + 1)}>
            ↻ Actualizar
          </button>
        </div>
        {error ? (
          <div className="api-error" role="alert">
            {error}
          </div>
        ) : loading ? (
          <div className="empty-state" role="status">
            Cargando carpetas…
          </div>
        ) : folders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Denominación</th>
                  <th>Carpeta</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {folders.map(folder => (
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
                      <strong>
                        {folder.denomination ||
                          (folder.expediente_number ? formatCaseNumber(folder.expediente_number) : `#${folder.expediente_id}`)}
                      </strong>
                    </td>
                    <td>{folderName(folder.name)}</td>
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
          <div className="empty-state">
            <Icon name="folder" />
            <h3>Aún no hay carpetas</h3>
            <p>Crea un expediente: su carpeta principal se crea con él.</p>
            <button className="primary" onClick={create}>
              Crear expediente
            </button>
          </div>
        )}
        <div className="table-footer">
          <span>Mostrando las 5 carpetas más recientes</span>
          <button className="row-link" onClick={() => navigate('carpetas')}>
            Ver todas las carpetas →
          </button>
        </div>
      </section>
    </>
  )
}
const viewOf = (route: Route): View | null =>
  route.name === 'dashboard' ||
  route.name === 'expedientes' ||
  route.name === 'carpetas' ||
  route.name === 'personas'
    ? route.name
    : null

function NotFound() {
  return (
    <div className="empty-state">
      <h3>Página no encontrada</h3>
      <p>La dirección no corresponde a ninguna sección del sistema.</p>
      <button className="primary" onClick={() => navigate(paths.dashboard())}>
        Ir al dashboard
      </button>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const view = viewOf(route)
  // Último rol consultado, para volver a él desde el menú.
  const [lastRole, setLastRole] = useState<Role>(route.name === 'personas' ? route.role : 'denunciantes')
  const [peopleExpanded, setPeopleExpanded] = useState(view === 'personas')
  const [menu, setMenu] = useState(false)
  const altCaseView = useAltCaseView()
  // Interruptor del grupo Admin; se recuerda en este navegador.
  const [adminOn, setAdminOn] = useState(() => {
    try {
      return localStorage.getItem('admin-menu') === 'on'
    } catch {
      return false
    }
  })
  const adminVisible = adminOn || route.name === 'folder-types'
  function toggleAdmin() {
    const next = !adminVisible
    setAdminOn(next)
    try {
      localStorage.setItem('admin-menu', next ? 'on' : 'off')
    } catch {
      // Sin almacenamiento: el interruptor solo dura esta sesión.
    }
  }
  // Al entrar en Personas (por menú, enlace o botón atrás) se despliega su submenú.
  const [previousView, setPreviousView] = useState(view)
  if (view !== previousView) {
    setPreviousView(view)
    if (view === 'personas') setPeopleExpanded(true)
  }
  const peopleRole = route.name === 'personas' ? route.role : lastRole
  if (route.name === 'personas' && route.role !== lastRole) setLastRole(route.role)

  function go(path: string) {
    setMenu(false)
    navigate(path)
  }
  function goTo(next: View) {
    go(
      next === 'dashboard'
        ? paths.dashboard()
        : next === 'expedientes'
          ? paths.cases()
          : next === 'carpetas'
            ? paths.folders()
            : paths.people(peopleRole),
    )
  }
  const sectionLabel =
    view === 'personas'
      ? peopleRole === 'denunciantes'
        ? 'Denunciantes'
        : 'Denunciados'
      : view
        ? views.find(item => item.id === view)?.label
        : route.name === 'folder-types'
          ? 'Admin / Tipos de carpeta'
          : 'Página no encontrada'

  return (
    <div className="app-shell">
      {menu && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <a
          className="app-brand"
          href={paths.dashboard()}
          onClick={event => {
            event.preventDefault()
            goTo('dashboard')
          }}
        >
          <span className="brand-symbol">
            E<span>•</span>
          </span>
          <span>
            ÉTICA CAL<small>SISTEMA DE GESTIÓN</small>
          </span>
        </a>
        <p className="nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Navegación principal">
          {views
            .filter(item => item.id !== 'personas')
            .map(item => (
              <button
                key={item.id}
                className={view === item.id ? 'selected' : ''}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => goTo(item.id)}
              >
                <Icon name={item.icon} />
                {item.label}
                {view === item.id && <span className="nav-dot" />}
              </button>
            ))}
          <button
            className={view === 'personas' ? 'selected' : ''}
            aria-expanded={peopleExpanded}
            aria-controls="personas-subnav"
            onClick={() => {
              if (view !== 'personas') goTo('personas')
              else setPeopleExpanded(!peopleExpanded)
            }}
          >
            <Icon name="users" />
            Personas
            <span className="nav-chevron">
              <Icon name="chevron" />
            </span>
          </button>
          {peopleExpanded && (
            <div className="sidebar-subnav" id="personas-subnav">
              {(['denunciantes', 'denunciados'] as Role[]).map(role => (
                <button
                  key={role}
                  className={view === 'personas' && peopleRole === role ? 'selected' : ''}
                  aria-current={view === 'personas' && peopleRole === role ? 'page' : undefined}
                  onClick={() => go(paths.people(role))}
                >
                  {role === 'denunciantes' ? 'Denunciantes' : 'Denunciados'}
                </button>
              ))}
            </div>
          )}
        </nav>
        <div className="nav-label-row">
          <p className="nav-label">ADMIN</p>
          <button
            type="button"
            role="switch"
            className="admin-switch"
            aria-checked={adminVisible}
            aria-controls="admin-subnav"
            aria-label="Mostrar menú de administración"
            onClick={toggleAdmin}
          >
            {adminVisible ? 'ON' : 'OFF'}
            <span className="admin-switch-track" aria-hidden="true" />
          </button>
        </div>
        {adminVisible && (
          <nav aria-label="Administración" id="admin-subnav">
            <button
              className={route.name === 'folder-types' ? 'selected' : ''}
              aria-current={route.name === 'folder-types' ? 'page' : undefined}
              onClick={() => go(paths.folderTypes())}
            >
              <Icon name="folder" />
              Añadir tipo de carpeta
              {route.name === 'folder-types' && <span className="nav-dot" />}
            </button>
          </nav>
        )}
        <div className="sidebar-bottom">
          <span className="workspace-avatar">EC</span>
          <div>
            <strong>Ética CAL</strong>
            <small>Gestión interna</small>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu"
              aria-label="Abrir menú"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              ☰
            </button>
            <span className="breadcrumb">
              Ética CAL <span>/</span> <strong>{sectionLabel}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            {/* Solo dentro de un expediente (/expedientes/:id o desde una persona). */}
            {(route.name === 'expedientes' || route.name === 'personas') && route.caseRef && (
              <button
                type="button"
                className={`topbar-button${altCaseView ? ' is-active' : ''}`}
                aria-pressed={altCaseView}
                title={altCaseView ? 'Volver a la vista normal' : 'Cambiar a la vista alternativa'}
                onClick={() => setAltCaseView(!altCaseView)}
              >
                Vista alternativa <span aria-hidden="true">{altCaseView ? '◧' : '▤'}</span>
              </button>
            )}
            <AppearancePicker />
          </div>
        </header>
        <main className="workspace-content">
          {route.name === 'dashboard' ? (
            <Dashboard
              navigate={goTo}
              create={() => go(paths.newCase())}
              open={folder => navigate(paths.caseFile(folder.expediente_id, folder.id))}
            />
          ) : route.name === 'carpetas' ? (
            <FoldersList />
          ) : route.name === 'folder-types' ? (
            <FolderTypesAdmin />
          ) : route.name === 'not-found' ? (
            <NotFound />
          ) : (
            <Management route={route} />
          )}
        </main>
        <footer className="app-footer">
          <span>Ética CAL · Sistema de gestión</span>
          <span>Gestión de expedientes</span>
        </footer>
      </div>
    </div>
  )
}
