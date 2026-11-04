import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  acceptedUploads,
  buildSectionTree,
  caseStatuses,
  locationLabel,
  statusLabel,
  documentsService,
  foldersService,
  folderName,
  maxUploadBytes,
  peruDate,
  sectionsService,
  todayInPeru,
} from '../services/api'
import { navigate, paths } from '../router'
import useLocations from './useLocations'
import type {
  DocumentRecord,
  ExpedienteFolder,
  ExpedienteSection,
  FolderType,
  SectionInput,
  SectionNode,
} from '../services/api'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
const sectionColors = ['#2563EB', '#0E9F6E', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2', '#808080']
const defaultTypes = ['Escrito de oficio', 'Resolución', 'OTROS']
const lockedMessage = 'La carpeta está cerrada: reábrela para agregar o modificar secciones y documentos.'

type DocsState = { items: DocumentRecord[]; loading: boolean; error: string }
// Lo último visto de cada carpeta: al volver a ella se muestra al instante y se actualiza por detrás.
type FolderSnapshot = {
  sections: ExpedienteSection[]
  expanded: Set<number>
  docs: Record<number, DocsState>
}
const folderCache = new Map<string, FolderSnapshot>()
type SectionDialog =
  | { mode: 'create'; parent: ExpedienteSection | null }
  | { mode: 'edit'; section: ExpedienteSection }
type DocumentDialog =
  | { mode: 'create'; section: ExpedienteSection }
  | { mode: 'edit'; document: DocumentRecord }
type Confirm = { title: string; message: ReactNode; confirmLabel: string; action: () => Promise<void> }

const icons: Record<string, ReactNode> = {
  chevron: <path d="m9 6 6 6-6 6" />,
  eyedropper: (
    <>
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </>
  ),
  folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  folderPlus: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M12 10v6M9 13h6" />
    </>
  ),
  filePlus: (
    <>
      <path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M12 12v6M9 15h6" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  unlink: (
    <>
      <path d="M9 15 15 9" />
      <path d="M10 6.5 12 4.5a4 4 0 0 1 6 6l-2 2M14 17.5l-2 2a4 4 0 0 1-6-6l2-2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" />
      <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
}
function Icon({ name, size = 16 }: { name: keyof typeof icons; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  )
}
function IconButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
  locked,
}: {
  icon: keyof typeof icons
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'danger'
  locked?: boolean
}) {
  // Un botón deshabilitado no muestra tooltip: el aviso va en un contenedor.
  if (locked)
    return (
      <span className="locked-wrap" title={lockedMessage}>
        <button
          type="button"
          className={`tree-icon-button${tone ? ' is-' + tone : ''}`}
          aria-label={`${label} (expediente cerrado)`}
          disabled
        >
          <Icon name={icon} />
        </button>
      </span>
    )
  return (
    <button
      type="button"
      className={`tree-icon-button${tone ? ' is-' + tone : ''}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}
function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value + 'T00:00:00')
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(date)
}
function fileLabel(url?: string | null) {
  if (!url) return ''
  const extension = url.split('?')[0].split('.').pop()?.toUpperCase() || ''
  return extension.length <= 4 ? extension : 'ARCHIVO'
}
// Tipo de archivo para darle color al ícono.
function fileKind(url?: string | null) {
  if (!url) return 'none'
  const extension = fileLabel(url).toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (extension === 'doc' || extension === 'docx') return 'doc'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'img'
  return 'other'
}

function Modal({
  eyebrow,
  title,
  description,
  busy,
  onClose,
  children,
  size = 'md',
}: {
  eyebrow?: string
  title: string
  description?: string
  busy?: boolean
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md'
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <div
      className="person-dialog-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className={`person-dialog tree-dialog tree-dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-dialog-title"
      >
        <div className="person-dialog-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="tree-dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar diálogo"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function SectionForm({
  dialog,
  sections,
  types,
  onCancel,
  onSubmit,
}: {
  dialog: SectionDialog
  sections: ExpedienteSection[]
  types: string[]
  onCancel: () => void
  onSubmit: (values: {
    name: string
    type: string
    document_date: string
    color_hex: string
    sort_order: number
    parent: number | null
  }) => Promise<void>
}) {
  const editing = dialog.mode === 'edit' ? dialog.section : null
  const initialParent = editing
    ? editing.expediente_section_parent_id
    : dialog.mode === 'create'
      ? (dialog.parent?.id ?? null)
      : null
  const siblingsCount = sections.filter(
    item => (item.expediente_section_parent_id ?? null) === initialParent,
  ).length
  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState(editing?.type ?? '')
  const [date, setDate] = useState(editing?.document_date ?? '')
  const [color, setColor] = useState(
    (
      editing?.color_hex ??
      (dialog.mode === 'create' && dialog.parent ? dialog.parent.color_hex : sectionColors[0])
    ).toUpperCase(),
  )
  const [order, setOrder] = useState(String(editing?.sort_order ?? siblingsCount))
  const [parent, setParent] = useState(initialParent === null ? '' : String(initialParent))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Una sección no puede moverse dentro de sí misma ni de sus descendientes.
  const blocked = useMemo(() => {
    const ids = new Set<number>()
    if (!editing) return ids
    ids.add(editing.id)
    let added = true
    while (added) {
      added = false
      for (const item of sections)
        if (
          item.expediente_section_parent_id != null &&
          ids.has(item.expediente_section_parent_id) &&
          !ids.has(item.id)
        ) {
          ids.add(item.id)
          added = true
        }
    }
    return ids
  }, [editing, sections])
  const pathOf = (section: ExpedienteSection) => {
    const names = [section.name]
    let current = section
    for (let guard = 0; guard < 50 && current.expediente_section_parent_id != null; guard++) {
      const next = sections.find(item => item.id === current.expediente_section_parent_id)
      if (!next) break
      names.unshift(next.name)
      current = next
    }
    return names.join(' / ')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSubmit({
        name,
        type,
        document_date: date,
        color_hex: color,
        sort_order: Number(order),
        parent: parent ? Number(parent) : null,
      })
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }
  return (
    <form className="case-create-form tree-form" onSubmit={submit}>
      {dialog.mode === 'create' && dialog.parent && (
        <p className="tree-form-context">
          <Icon name="folderPlus" /> Dentro de <strong>{pathOf(dialog.parent)}</strong>
        </p>
      )}
      <div>
        <label htmlFor="section-name">
          Nombre <b>*</b>
        </label>
        <input
          id="section-name"
          required
          autoFocus
          maxLength={255}
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Ej. Denuncia"
        />
      </div>
      <div className="tree-form-row">
        <div>
          <label htmlFor="section-type">
            Tipo <b>*</b>
          </label>
          <input
            id="section-type"
            required
            maxLength={255}
            list="section-type-options"
            value={type}
            onChange={event => setType(event.target.value)}
            placeholder="Elige o escribe un tipo"
          />
          <datalist id="section-type-options">
            {types.map(item => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="section-date">
            Fecha <span>(opcional)</span>
          </label>
          <input id="section-date" type="date" value={date} onChange={event => setDate(event.target.value)} />
        </div>
      </div>
      <div>
        <span className="tree-label">Color</span>
        <div className="tree-color-options" role="radiogroup" aria-label="Color de la sección">
          {sectionColors.map(option => (
            <button
              type="button"
              key={option}
              role="radio"
              aria-checked={color === option}
              aria-label={option}
              title={option}
              style={{ background: option }}
              onClick={() => setColor(option)}
            />
          ))}
          <label className="tree-color-custom" title="Color personalizado">
            <input
              type="color"
              value={color.toLowerCase()}
              onChange={event => setColor(event.target.value.toUpperCase())}
              aria-label="Color personalizado"
            />
            <Icon name="eyedropper" />
            <span>{color}</span>
          </label>
        </div>
      </div>
      {editing && (
        <div className="tree-form-row">
          <div>
            <label htmlFor="section-parent">Ubicación</label>
            <select id="section-parent" value={parent} onChange={event => setParent(event.target.value)}>
              <option value="">Raíz de la carpeta</option>
              {sections
                .filter(item => !blocked.has(item.id))
                .map(item => (
                  <option key={item.id} value={item.id}>
                    {pathOf(item)}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="section-order">Orden</label>
            <input
              id="section-order"
              type="number"
              min={0}
              step={1}
              required
              value={order}
              onChange={event => setOrder(event.target.value)}
            />
          </div>
        </div>
      )}
      {error && (
        <p className="api-error" role="alert">
          {error}
        </p>
      )}
      <div className="case-create-actions">
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear sección'}
        </button>
      </div>
    </form>
  )
}

function FilePicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      className={`tree-dropzone${file ? ' has-file' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault()
        if (!disabled) onChange(event.dataTransfer.files?.[0] || null)
      }}
    >
      <input
        ref={input}
        id="document-file"
        type="file"
        accept={acceptedUploads}
        disabled={disabled}
        onChange={event => onChange(event.currentTarget.files?.[0] || null)}
      />
      {file ? (
        <>
          <span className="tree-file-badge">
            <Icon name="file" size={18} />
          </span>
          <div>
            <strong>{file.name}</strong>
            <small>{(file.size / 1024 / 1024).toFixed(2)} MiB</small>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={() => {
              onChange(null)
              if (input.current) input.current.value = ''
            }}
          >
            Quitar
          </button>
        </>
      ) : (
        <label htmlFor="document-file">
          <span className="tree-file-badge">
            <Icon name="filePlus" size={18} />
          </span>
          <div>
            <strong>Arrastra un archivo o haz clic para elegirlo</strong>
            <small>PDF, DOC, DOCX o imagen · máximo 10 MiB</small>
          </div>
        </label>
      )}
    </div>
  )
}

function DocumentForm({
  dialog,
  expedienteId,
  sectionDocs,
  onCancel,
  onCreate,
  onLink,
  onEdit,
}: {
  dialog: DocumentDialog
  expedienteId: number
  sectionDocs: DocumentRecord[]
  onCancel: () => void
  onCreate: (
    name: string,
    date: string,
    file: File | null,
    retryId: number | null,
    setRetry: (id: number) => void,
    setStatus: (text: string) => void,
  ) => Promise<void>
  onLink: (document: DocumentRecord) => Promise<void>
  onEdit: (name: string, date: string, file: File | null, setStatus: (text: string) => void) => Promise<void>
}) {
  const editing = dialog.mode === 'edit' ? dialog.document : null
  const [tab, setTab] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState(editing?.name ?? '')
  // Por defecto, la fecha de hoy en Perú; se puede cambiar antes de guardar.
  const [date, setDate] = useState(editing ? peruDate(editing.document_date) : todayInPeru())
  const [file, setFile] = useState<File | null>(null)
  const [retryId, setRetryId] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState<DocumentRecord[] | null>(null)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  useEffect(() => {
    if (tab !== 'existing' || existing) return
    let current = true
    documentsService
      .byExpediente(expedienteId)
      .then(rows => {
        if (current) setExisting(rows)
      })
      .catch(caught => {
        if (current) {
          setError(errorMessage(caught))
          setExisting([])
        }
      })
    return () => {
      current = false
    }
  }, [tab, existing, expedienteId])
  function pickFile(next: File | null) {
    setError('')
    if (next && next.size > maxUploadBytes) {
      setError('El archivo supera el máximo permitido de 10 MiB.')
      return
    }
    setFile(next)
    if (next && !name.trim() && !editing) setName(next.name)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editing) await onEdit(name, date, file, setStatus)
      else if (tab === 'existing') {
        const document = existing?.find(item => item.id === chosen)
        if (!document) throw new Error('Selecciona un documento para vincular.')
        await onLink(document)
      } else await onCreate(name, date, file, retryId, setRetryId, setStatus)
    } catch (caught) {
      setError(errorMessage(caught))
      setStatus('')
      setSaving(false)
    }
  }
  const linkedIds = new Set(sectionDocs.map(item => item.id))
  const candidates = (existing || []).filter(
    item => !linkedIds.has(item.id) && item.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <form className="case-create-form tree-form" onSubmit={submit}>
      {!editing && (
        <div className="status-filter tree-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'new'}
            className={`status-filter-button${tab === 'new' ? ' active' : ''}`}
            disabled={saving || retryId !== null}
            onClick={() => {
              setTab('new')
              setError('')
            }}
          >
            <Icon name="filePlus" /> Nuevo documento
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'existing'}
            className={`status-filter-button${tab === 'existing' ? ' active' : ''}`}
            disabled={saving || retryId !== null}
            onClick={() => {
              setTab('existing')
              setError('')
            }}
          >
            <Icon name="link" /> Vincular existente
          </button>
        </div>
      )}
      {tab === 'new' || editing ? (
        <>
          <div>
            <label htmlFor="document-name">
              Nombre <b>*</b>
            </label>
            <input
              id="document-name"
              required
              autoFocus
              maxLength={255}
              value={name}
              disabled={retryId !== null}
              onChange={event => setName(event.target.value)}
              placeholder="Ej. Denuncia firmada.pdf"
            />
          </div>
          <div>
            <label htmlFor="document-date">
              Fecha del documento {editing ? <span>(opcional)</span> : <b>*</b>}
            </label>
            <input
              id="document-date"
              type="date"
              required={!editing}
              value={date}
              disabled={retryId !== null}
              onChange={event => setDate(event.target.value)}
            />
          </div>
          <div>
            <span className="tree-label">
              {editing?.file_url ? 'Reemplazar archivo' : 'Archivo'} <span>(opcional)</span>
            </span>
            <FilePicker file={file} onChange={pickFile} disabled={saving} />
          </div>
          {editing?.file_url && !file && (
            <p className="tree-form-context">
              <Icon name="file" /> Archivo actual:{' '}
              <a className="row-link" href={editing.file_url} target="_blank" rel="noopener noreferrer">
                abrir <Icon name="external" size={13} />
              </a>
            </p>
          )}
          {editing && (
            <p className="tree-form-note">
              Si este documento está en varias secciones, el cambio se verá en todas.
            </p>
          )}
          {retryId !== null && (
            <p className="tree-form-note is-warning">
              El documento ya se creó, pero el archivo no se pudo subir. Vuelve a intentarlo o cierra para
              dejarlo sin archivo.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="people-search tree-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar documento"
            />
          </div>
          {existing === null ? (
            <p className="detail-empty" role="status">
              Cargando documentos del expediente…
            </p>
          ) : candidates.length ? (
            <ul className="tree-pick-list" role="listbox" aria-label="Documentos disponibles">
              {candidates.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen === item.id}
                    className={chosen === item.id ? 'is-selected' : ''}
                    onClick={() => setChosen(item.id)}
                  >
                    <span className="tree-file-badge">
                      <Icon name="file" />
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.file_url ? fileLabel(item.file_url) : 'Sin archivo'} · ID {item.id}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tree-empty-inline">
              {existing.length
                ? 'No hay otros documentos que coincidan.'
                : 'Este expediente aún no tiene documentos para reutilizar.'}
            </p>
          )}
        </>
      )}
      {status && (
        <p className="tree-form-note" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="api-error" role="alert">
          {error}
        </p>
      )}
      <div className="case-create-actions">
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
          {retryId !== null ? 'Cerrar' : 'Cancelar'}
        </button>
        <button className="primary" disabled={saving || (tab === 'existing' && !editing && chosen === null)}>
          {saving
            ? file
              ? 'Subiendo…'
              : 'Guardando…'
            : editing
              ? 'Guardar cambios'
              : tab === 'existing'
                ? 'Vincular'
                : retryId !== null
                  ? 'Reintentar subida'
                  : 'Crear documento'}
        </button>
      </div>
    </form>
  )
}

function LockedTip({ locked, children }: { locked: boolean; children: ReactNode }) {
  return locked ? (
    <span
      className="locked-wrap locked-tip"
      data-tooltip={lockedMessage}
      tabIndex={0}
      aria-label={lockedMessage}
    >
      {children}
    </span>
  ) : (
    <>{children}</>
  )
}

// Ofrece solo los tipos de carpeta que el expediente todavía no tiene.
function FolderForm({
  expedienteId,
  folders,
  onCancel,
  onCreated,
}: {
  expedienteId: number
  folders: ExpedienteFolder[]
  onCancel: () => void
  onCreated: (folder: ExpedienteFolder) => void
}) {
  const [types, setTypes] = useState<FolderType[] | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  // Por defecto, la fecha de hoy en Perú; se puede cambiar antes de crear.
  const [openingDate, setOpeningDate] = useState(todayInPeru)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    foldersService
      .types()
      .then(rows => {
        if (current) setTypes(rows)
      })
      .catch(caught => {
        if (current) {
          setError(errorMessage(caught))
          setTypes([])
        }
      })
    return () => {
      current = false
    }
  }, [])
  const existing = new Set(folders.map(folder => folder.folder_type_id))
  const available = (types || []).filter(type => !existing.has(type.id))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (chosen === null) return
    setSaving(true)
    setError('')
    try {
      onCreated(await foldersService.create(expedienteId, chosen, openingDate))
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }
  return (
    <form className="case-create-form tree-form" onSubmit={submit}>
      {types === null ? (
        <p className="detail-empty" role="status">
          Cargando tipos de carpeta…
        </p>
      ) : available.length ? (
        <ul className="tree-pick-list" role="listbox" aria-label="Tipos de carpeta disponibles">
          {available.map(type => (
            <li key={type.id}>
              <button
                type="button"
                role="option"
                aria-selected={chosen === type.id}
                className={chosen === type.id ? 'is-selected' : ''}
                onClick={() => setChosen(type.id)}
              >
                <span className={`tree-file-badge${type.abbreviation ? ' folder-abbr' : ''}`}>
                  {type.abbreviation || <Icon name="folder" />}
                </span>
                <span>
                  <strong>{folderName(type.name)}</strong>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <p className="tree-empty-inline">Este expediente ya tiene todas las carpetas disponibles.</p>
        )
      )}
      {types !== null && (
        <p className="tree-form-note">
          ¿Falta un tipo? Créalo en{' '}
          <a
            className="row-link"
            href={paths.folderTypes()}
            onClick={event => {
              event.preventDefault()
              navigate(paths.folderTypes())
            }}
          >
            Admin · Tipos de carpeta
          </a>
          .
        </p>
      )}
      {available.length > 0 && (
        <div>
          <label htmlFor="folder-opening-date">
            Fecha de apertura <b>*</b>
          </label>
          <input
            id="folder-opening-date"
            type="date"
            required
            value={openingDate}
            disabled={saving}
            onChange={event => setOpeningDate(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p className="api-error" role="alert">
          {error}
        </p>
      )}
      <div className="case-create-actions">
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={saving || chosen === null || !openingDate}>
          {saving ? 'Creando…' : 'Añadir carpeta'}
        </button>
      </div>
    </form>
  )
}

// Navegación expediente → carpeta → secciones. Cada carpeta carga su propio árbol.
export default function CaseDocuments({
  expedienteId,
  folderId = null,
  onFolderChange,
}: {
  expedienteId: number
  // Carpeta indicada en la URL; si no existe se muestra la primera.
  folderId?: number | null
  onFolderChange?: (folderId: number) => void
}) {
  const [folders, setFolders] = useState<ExpedienteFolder[]>([])
  const [localFolder, setLocalFolder] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    foldersService
      .list(expedienteId)
      .then(rows => {
        if (!current) return
        setFolders(rows)
      })
      .catch(caught => {
        if (current) setError(errorMessage(caught))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [expedienteId, refresh])
  const wanted = folderId ?? localFolder
  const folder = folders.find(item => item.id === wanted) || folders[0] || null
  const selected = folder?.id ?? null
  function select(id: number) {
    setLocalFolder(id)
    onFolderChange?.(id)
  }
  function created(next: ExpedienteFolder) {
    setFolders(state => (state.some(item => item.id === next.id) ? state : [...state, next]))
    select(next.id)
    setAdding(false)
  }
  const updated = (next: ExpedienteFolder) =>
    setFolders(state => state.map(item => (item.id === next.id ? { ...item, ...next } : item)))
  return (
    <section className="documents-panel tree-panel">
      <div className="detail-panel-heading">
        <div>
          <p className="eyebrow">ARCHIVO DEL EXPEDIENTE</p>
          <h3>Documentos</h3>
        </div>
      </div>
      {error && (
        <p className="api-error tree-notice" role="alert">
          {error}{' '}
          <button type="button" className="row-link" onClick={() => setRefresh(value => value + 1)}>
            Reintentar
          </button>
        </p>
      )}
      <div className="folder-cabinet">
        <div className="folder-tabs" role="tablist" aria-label="Carpetas del expediente">
          {folders.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`folder-tab-${item.id}`}
              aria-selected={item.id === selected}
              aria-controls="folder-panel"
              className={`folder-tab${item.id === selected ? ' is-active' : ''}`}
              onClick={() => select(item.id)}
            >
              <span className={`folder-tab-icon${item.abbreviation ? ' has-abbr' : ''}`}>
                {item.abbreviation || <Icon name="folder" />}
              </span>
              <span className="folder-tab-text">
                <strong>{folderName(item.name)}</strong>
                <small>
                  {item.status && (
                    <span
                      className={`folder-tab-status${item.status === 'CERRADO' ? ' is-closed' : ''}`}
                      title={statusLabel(item.status)}
                    >
                      {item.status === 'CERRADO' ? <Icon name="lock" size={11} /> : <i aria-hidden="true" />}
                      <span className="visually-hidden">{statusLabel(item.status)}</span>
                    </span>
                  )}
                  {item.opening_date && <span>{formatDate(peruDate(item.opening_date))}</span>}
                </small>
              </span>
            </button>
          ))}
          {loading && !folders.length && (
            <span className="tree-empty-inline" role="status">
              Cargando carpetas…
            </span>
          )}
        </div>
        <div className="folder-bar-actions">
          <button
            type="button"
            className="secondary tree-refresh"
            disabled={loading}
            onClick={() => setRefresh(value => value + 1)}
            aria-label="Actualizar carpetas y secciones"
            title="Actualizar"
          >
            <Icon name="refresh" />
          </button>
          <button
            type="button"
            className="secondary folder-add"
            disabled={loading}
            onClick={() => setAdding(true)}
          >
            <Icon name="folderPlus" /> Añadir carpeta
          </button>
        </div>
      </div>
      {folder ? (
        <div
          id="folder-panel"
          className={`folder-sheet${folder.id === folders[0]?.id ? ' is-first' : ''}`}
          role="tabpanel"
          aria-labelledby={`folder-tab-${folder.id}`}
        >
          <FolderTree
            key={folder.id}
            expedienteId={expedienteId}
            folder={folder}
            reload={refresh}
            onFolderUpdated={updated}
          />
        </div>
      ) : (
        !loading &&
        !error && (
          <div className="documents-empty">
            <span aria-hidden="true">
              <Icon name="folder" size={28} />
            </span>
            <h4>Este expediente no tiene carpetas</h4>
            <p>Añade una carpeta para organizar sus secciones y documentos.</p>
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Añadir carpeta
            </button>
          </div>
        )
      )}
      {adding && (
        <Modal
          eyebrow="CARPETAS"
          title="Añadir carpeta"
          description="Cada expediente tiene como máximo una carpeta de cada tipo. Indica su fecha de apertura."
          onClose={() => setAdding(false)}
        >
          <FolderForm
            expedienteId={expedienteId}
            folders={folders}
            onCancel={() => setAdding(false)}
            onCreated={created}
          />
        </Modal>
      )}
    </section>
  )
}

function FolderTree({
  expedienteId,
  folder,
  reload,
  onFolderUpdated,
}: {
  expedienteId: number
  folder: ExpedienteFolder
  // Cambia cuando se pulsa "Actualizar" en la barra de carpetas.
  reload: number
  onFolderUpdated: (folder: ExpedienteFolder) => void
}) {
  // Una carpeta cerrada queda en solo lectura (sus secciones y documentos).
  const locked = folder.status === 'CERRADO'
  const locations = useLocations()
  const [savingState, setSavingState] = useState<string | null>(null)
  const [stateError, setStateError] = useState('')
  const track =
    folder.location && !locations.some(option => option.value === folder.location)
      ? [...locations, { value: folder.location, label: locationLabel(folder.location) }]
      : locations
  const currentStep = track.findIndex(option => option.value === folder.location)
  async function changeState(kind: 'status' | 'location', value: string) {
    if (savingState || value === folder[kind]) return
    setSavingState(`${kind}:${value}`)
    setStateError('')
    try {
      const next =
        kind === 'status'
          ? await foldersService.updateStatus(expedienteId, folder.id, value)
          : await foldersService.updateLocation(expedienteId, folder.id, value)
      onFolderUpdated({ ...folder, ...next, [kind]: next?.[kind] ?? value })
    } catch (caught) {
      setStateError(errorMessage(caught))
    } finally {
      setSavingState(null)
    }
  }
  const cacheKey = `${expedienteId}:${folder.id}`
  const [cached] = useState(() => folderCache.get(cacheKey))
  const [sections, setSections] = useState<ExpedienteSection[]>(cached?.sections ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [expanded, setExpanded] = useState<Set<number>>(cached?.expanded ?? new Set())
  const [docs, setDocs] = useState<Record<number, DocsState>>(cached?.docs ?? {})
  useEffect(() => {
    folderCache.set(cacheKey, { sections, expanded, docs })
  }, [cacheKey, sections, expanded, docs])
  // Las barras de carga solo aparecen si la primera carga tarda; si es rápida no hay parpadeo.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), 250)
    return () => clearTimeout(timer)
  }, [loading])
  const [sectionDialog, setSectionDialog] = useState<SectionDialog | null>(null)
  const [documentDialog, setDocumentDialog] = useState<DocumentDialog | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [notice, setNotice] = useState('')
  const [moving, setMoving] = useState<number | null>(null)
  const firstLoad = useRef(!cached)
  // Si la carpeta se cierra con un diálogo abierto, se cierra el diálogo.
  useEffect(() => {
    if (locked) {
      setSectionDialog(null)
      setDocumentDialog(null)
      setConfirm(null)
    }
  }, [locked])
  const expandedRef = useRef(expanded)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  // El tipo es texto libre: se sugieren los habituales y los ya usados en la carpeta.
  const types = useMemo(
    () => [...new Set([...defaultTypes, ...sections.map(item => item.type).filter(Boolean)])],
    [sections],
  )

  const loadDocs = useCallback(
    (sectionId: number) => {
      setDocs(state => ({
        ...state,
        [sectionId]: { items: state[sectionId]?.items ?? [], loading: true, error: '' },
      }))
      sectionsService
        .documents(expedienteId, sectionId)
        .then(items => setDocs(state => ({ ...state, [sectionId]: { items, loading: false, error: '' } })))
        .catch(caught =>
          setDocs(state => ({
            ...state,
            [sectionId]: { items: [], loading: false, error: errorMessage(caught) },
          })),
        )
    },
    [expedienteId],
  )

  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    foldersService
      .sections(expedienteId, folder.id)
      .then(rows => {
        if (!current) return
        setSections(rows)
        const ids = new Set(rows.map(row => row.id))
        if (firstLoad.current) {
          firstLoad.current = false
          const roots = rows
            .filter(
              row => row.expediente_section_parent_id == null || !ids.has(row.expediente_section_parent_id),
            )
            .map(row => row.id)
          setExpanded(new Set(roots))
          setDocs({})
          roots.forEach(loadDocs)
        } else {
          const keep = [...expandedRef.current].filter(id => ids.has(id))
          setExpanded(new Set(keep))
          setDocs(state => Object.fromEntries(keep.filter(id => state[id]).map(id => [id, state[id]])))
          keep.forEach(loadDocs)
        }
      })
      .catch(caught => {
        if (current) setError(errorMessage(caught))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [expedienteId, folder.id, refresh, reload, loadDocs])

  const tree = useMemo(() => buildSectionTree(sections), [sections])
  const nodes = useMemo(() => {
    const map = new Map<number, SectionNode>()
    const walk = (items: SectionNode[]) =>
      items.forEach(item => {
        map.set(item.id, item)
        walk(item.children)
      })
    walk(tree)
    return map
  }, [tree])
  const siblingsOf = (section: ExpedienteSection) =>
    section.expediente_section_parent_id != null && nodes.has(section.expediente_section_parent_id)
      ? nodes.get(section.expediente_section_parent_id)!.children
      : tree

  function toggle(section: ExpedienteSection) {
    const next = new Set(expanded)
    if (next.has(section.id)) next.delete(section.id)
    else {
      next.add(section.id)
      if (!docs[section.id]) loadDocs(section.id)
    }
    setExpanded(next)
  }
  function expandAll(open: boolean) {
    if (!open) {
      setExpanded(new Set())
      return
    }
    setExpanded(new Set(sections.map(item => item.id)))
    sections.forEach(item => {
      if (!docs[item.id]) loadDocs(item.id)
    })
  }

  async function saveSection(values: {
    name: string
    type: string
    document_date: string
    color_hex: string
    sort_order: number
    parent: number | null
  }) {
    if (!sectionDialog) return
    if (sectionDialog.mode === 'create') {
      // Siempre se envía la carpeta seleccionada.
      const created = await sectionsService.create(expedienteId, {
        expediente_folder_id: folder.id,
        name: values.name,
        type: values.type,
        document_date: values.document_date || undefined,
        color_hex: values.color_hex,
        sort_order: values.sort_order,
        expediente_section_parent_id: sectionDialog.parent?.id ?? null,
      })
      setSections(state => [...state, created])
      setExpanded(
        state => new Set([...state, created.id, ...(sectionDialog.parent ? [sectionDialog.parent.id] : [])]),
      )
      setDocs(state => ({ ...state, [created.id]: { items: [], loading: false, error: '' } }))
      setNotice(`Sección “${created.name}” creada.`)
    } else {
      const original = sectionDialog.section
      const patch: SectionInput = {}
      if (values.name.trim() !== original.name) patch.name = values.name
      if (values.type.trim() !== original.type) patch.type = values.type
      if ((values.document_date || null) !== (original.document_date || null))
        patch.document_date = values.document_date || null
      if (values.color_hex.toUpperCase() !== original.color_hex.toUpperCase())
        patch.color_hex = values.color_hex
      if (values.sort_order !== original.sort_order) patch.sort_order = values.sort_order
      if (values.parent !== (original.expediente_section_parent_id ?? null))
        patch.expediente_section_parent_id = values.parent
      if (Object.keys(patch).length) {
        const updated = await sectionsService.update(expedienteId, original.id, patch)
        setSections(state => state.map(item => (item.id === updated.id ? updated : item)))
        setNotice('Sección actualizada.')
      }
    }
    setSectionDialog(null)
  }

  async function move(section: ExpedienteSection, direction: -1 | 1) {
    const siblings = [...siblingsOf(section)]
    const index = siblings.findIndex(item => item.id === section.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= siblings.length) return
    ;[siblings[index], siblings[target]] = [siblings[target], siblings[index]]
    setMoving(section.id)
    setError('')
    try {
      const changes = siblings
        .map((item, order) => ({ item, order }))
        .filter(({ item, order }) => item.sort_order !== order)
      const updated = await Promise.all(
        changes.map(({ item, order }) =>
          sectionsService.update(expedienteId, item.id, { sort_order: order }),
        ),
      )
      setSections(state => state.map(item => updated.find(row => row.id === item.id) || item))
    } catch (caught) {
      setError(errorMessage(caught))
      setRefresh(value => value + 1)
    } finally {
      setMoving(null)
    }
  }

  function askDeleteSection(section: ExpedienteSection) {
    if (nodes.get(section.id)?.children.length) {
      setError(`“${section.name}” tiene subsecciones. Muévelas o elimínalas antes de borrar la sección.`)
      return
    }
    setConfirmError('')
    setConfirm({
      title: 'Eliminar sección',
      confirmLabel: 'Eliminar sección',
      message: (
        <>
          Se eliminará <strong>{section.name}</strong>. Sus documentos no se borran: solo se quitan de esta
          sección.
        </>
      ),
      action: async () => {
        await sectionsService.remove(expedienteId, section.id)
        setSections(state => state.filter(item => item.id !== section.id))
        setNotice('Sección eliminada.')
      },
    })
  }
  function askUnlink(section: ExpedienteSection, document: DocumentRecord) {
    setConfirmError('')
    setConfirm({
      title: 'Quitar documento',
      confirmLabel: 'Quitar de la sección',
      message: (
        <>
          Se quitará <strong>{document.name}</strong> de <strong>{section.name}</strong>. El documento y su
          archivo se conservan.
        </>
      ),
      action: async () => {
        await sectionsService.unlink(expedienteId, section.id, document.id)
        setDocs(state => ({
          ...state,
          [section.id]: {
            ...state[section.id],
            items: state[section.id].items.filter(item => item.id !== document.id),
          },
        }))
        setNotice('Documento quitado de la sección.')
      },
    })
  }
  async function runConfirm() {
    if (!confirm) return
    setConfirmBusy(true)
    setConfirmError('')
    try {
      await confirm.action()
      setConfirm(null)
    } catch (caught) {
      setConfirmError(errorMessage(caught))
    } finally {
      setConfirmBusy(false)
    }
  }

  // Un documento puede estar en varias secciones: el cambio se refleja en todas.
  const replaceDocument = (document: Partial<DocumentRecord> & { id: number }) =>
    setDocs(state =>
      Object.fromEntries(
        Object.entries(state).map(([key, value]) => [
          key,
          {
            ...value,
            items: value.items.map(item => (item.id === document.id ? { ...item, ...document } : item)),
          },
        ]),
      ),
    )
  async function createDocument(
    section: ExpedienteSection,
    name: string,
    date: string,
    file: File | null,
    retryId: number | null,
    setRetry: (id: number) => void,
    setStatus: (text: string) => void,
  ) {
    let document: DocumentRecord | null = null
    if (retryId === null) {
      document = await sectionsService.createDocument(expedienteId, section.id, {
        name,
        document_date: date || undefined,
      })
      setDocs(state => ({
        ...state,
        [section.id]: { items: [...(state[section.id]?.items || []), document!], loading: false, error: '' },
      }))
    }
    const id = retryId ?? document!.id
    if (file) {
      setStatus('Subiendo archivo…')
      try {
        replaceDocument(await documentsService.uploadFile(id, file))
      } catch (caught) {
        setRetry(id)
        throw caught
      }
    }
    setDocumentDialog(null)
    setNotice('Documento agregado.')
  }
  async function editDocument(
    document: DocumentRecord,
    name: string,
    date: string,
    file: File | null,
    setStatus: (text: string) => void,
  ) {
    let result = document
    const patch: { name?: string; document_date?: string | null } = {}
    if (name.trim() !== document.name) patch.name = name
    if (date !== peruDate(document.document_date)) patch.document_date = date || null
    if (Object.keys(patch).length)
      result = { ...result, ...(await documentsService.update(document.id, patch)) }
    if (file) {
      setStatus('Subiendo archivo…')
      result = { ...result, ...(await documentsService.uploadFile(document.id, file)) }
    }
    replaceDocument(result)
    setDocumentDialog(null)
    if (result !== document) setNotice('Documento actualizado.')
  }
  async function linkDocument(section: ExpedienteSection, document: DocumentRecord) {
    await sectionsService.link(expedienteId, section.id, document.id)
    setDocs(state => ({
      ...state,
      [section.id]: {
        items: [...(state[section.id]?.items || []).filter(item => item.id !== document.id), document],
        loading: false,
        error: '',
      },
    }))
    setDocumentDialog(null)
    setNotice('Documento vinculado.')
  }

  function renderSection(
    section: SectionNode,
    depth: number,
    index: number,
    siblings: number,
    prefix = '',
  ): ReactNode {
    const number = prefix ? `${prefix}.${index + 1}` : String(index + 1)
    const children = section.children
    const isOpen = expanded.has(section.id)
    const state = docs[section.id]
    const count = state && !state.loading && !state.error ? state.items.length : null
    return (
      <li
        key={section.id}
        className={`tree-node${isOpen ? ' is-open' : ''}`}
        style={{ '--section-color': section.color_hex || '#808080' } as CSSProperties}
      >
        <div className="tree-row">
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Contraer' : 'Expandir'} ${section.name}`}
            onClick={() => toggle(section)}
          >
            <Icon name="chevron" />
          </button>
          <span className="tree-folder" aria-hidden="true">
            {depth === 0 ? number.padStart(2, '0') : number}
          </span>
          <button type="button" className="tree-title" onClick={() => toggle(section)}>
            <strong>{section.name}</strong>
            <span className="tree-meta">
              <span className="tree-type">{section.type}</span>
              {section.document_date && (
                <span>
                  <Icon name="calendar" size={13} /> {formatDate(section.document_date)}
                </span>
              )}
              {count !== null && (
                <span>
                  {count} {count === 1 ? 'documento' : 'documentos'}
                </span>
              )}
              {children.length > 0 && (
                <span>
                  {children.length} {children.length === 1 ? 'subsección' : 'subsecciones'}
                </span>
              )}
            </span>
          </button>
          <div className="tree-actions">
            <IconButton
              icon="up"
              label="Subir"
              locked={locked}
              disabled={index === 0 || moving !== null}
              onClick={() => void move(section, -1)}
            />
            <IconButton
              icon="down"
              label="Bajar"
              locked={locked}
              disabled={index === siblings - 1 || moving !== null}
              onClick={() => void move(section, 1)}
            />
            <span className="tree-actions-divider" />
            <IconButton
              icon="filePlus"
              label="Agregar documento"
              locked={locked}
              onClick={() => {
                if (!docs[section.id]) loadDocs(section.id)
                setDocumentDialog({ mode: 'create', section })
              }}
            />
            <IconButton
              icon="folderPlus"
              label="Agregar subsección"
              locked={locked}
              onClick={() => setSectionDialog({ mode: 'create', parent: section })}
            />
            <IconButton
              icon="edit"
              label="Editar sección"
              locked={locked}
              onClick={() => setSectionDialog({ mode: 'edit', section })}
            />
            <IconButton
              icon="trash"
              label="Eliminar sección"
              tone="danger"
              locked={locked}
              onClick={() => askDeleteSection(section)}
            />
          </div>
        </div>
        {isOpen && (
          <div className="tree-body">
            {!state || (state.loading && !state.items.length) ? (
              <div className="tree-skeleton is-docs" role="status" aria-label="Cargando documentos">
                <span />
                <span />
              </div>
            ) : state.error ? (
              <p className="api-error" role="alert">
                {state.error}{' '}
                <button type="button" className="row-link" onClick={() => loadDocs(section.id)}>
                  Reintentar
                </button>
              </p>
            ) : state.items.length ? (
              <ul className="tree-documents">
                {state.items.map(document => (
                  <li key={document.id}>
                    <span className="tree-file-badge" data-kind={fileKind(document.file_url)}>
                      <Icon name="file" />
                    </span>
                    <div className="tree-document-name">
                      {document.file_url ? (
                        <a href={document.file_url} target="_blank" rel="noopener noreferrer">
                          {document.name}
                        </a>
                      ) : (
                        <span>{document.name}</span>
                      )}
                      <small>
                        {document.file_url ? (
                          <span className="tree-file-tag" data-kind={fileKind(document.file_url)}>
                            {fileLabel(document.file_url)}
                          </span>
                        ) : (
                          <span className="tree-file-tag is-missing">Sin archivo</span>
                        )}
                        {document.document_date && (
                          <span>
                            <Icon name="calendar" size={13} /> {formatDate(peruDate(document.document_date))}
                          </span>
                        )}
                      </small>
                    </div>
                    <div className="tree-actions">
                      {document.file_url && (
                        <a
                          className="tree-icon-button"
                          href={document.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${document.name}`}
                          title="Abrir archivo"
                        >
                          <Icon name="external" />
                        </a>
                      )}
                      <IconButton
                        icon="edit"
                        label="Editar documento"
                        locked={locked}
                        onClick={() => setDocumentDialog({ mode: 'edit', document })}
                      />
                      <IconButton
                        icon="unlink"
                        label="Quitar de la sección"
                        tone="danger"
                        locked={locked}
                        onClick={() => askUnlink(section, document)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              children.length === 0 &&
              (locked ? (
                <p className="tree-empty-inline">Sin documentos.</p>
              ) : (
                <button
                  type="button"
                  className="tree-empty-action"
                  onClick={() => setDocumentDialog({ mode: 'create', section })}
                >
                  <Icon name="plus" /> Agregar el primer documento
                </button>
              ))
            )}
            {children.length > 0 && (
              <ul className="tree-children">
                {children.map((child, childIndex) =>
                  renderSection(child, depth + 1, childIndex, children.length, number),
                )}
              </ul>
            )}
          </div>
        )}
      </li>
    )
  }

  const activeSection = documentDialog?.mode === 'create' ? documentDialog.section : null
  return (
    <>
      <div className="folder-head">
        <p className="folder-head-meta">
          {!loading && `${sections.length} ${sections.length === 1 ? 'sección' : 'secciones'}`}
        </p>
        <div className={`folder-state${locked ? ' is-locked' : ''}`}>
          <div className="folder-state-item">
            <span className="folder-state-label">Estado</span>
            <div
              className="state-switch"
              data-value={folder.status}
              role="radiogroup"
              aria-label="Estado de la carpeta"
            >
              <span className="state-switch-thumb" aria-hidden="true" />
              {caseStatuses.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={folder.status === option.value}
                  disabled={savingState !== null}
                  onClick={() => void changeState('status', option.value)}
                >
                  <span className="state-dot" aria-hidden="true" />
                  {savingState === 'status:' + option.value ? 'Guardando…' : option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="folder-state-item is-wide">
            <span className="folder-state-label">Ubicación</span>
            <ol
              className="location-track"
              aria-label="Ubicación de la carpeta"
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
                    disabled={savingState !== null}
                    aria-current={index === currentStep ? 'step' : undefined}
                    title={`Mover la carpeta a ${option.label}`}
                    onClick={() => void changeState('location', option.value)}
                  >
                    <span className="track-dot" aria-hidden="true">
                      {savingState === 'location:' + option.value ? <span className="track-spinner" /> : index + 1}
                    </span>
                    <span className="track-label">{option.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="documents-actions">
          {sections.length > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() => expandAll(expanded.size < sections.length)}
            >
              {expanded.size < sections.length ? 'Expandir todo' : 'Contraer todo'}
            </button>
          )}
          <LockedTip locked={locked}>
            <button
              type="button"
              className="primary"
              disabled={locked}
              onClick={() => setSectionDialog({ mode: 'create', parent: null })}
            >
              <Icon name="plus" /> Nueva sección
            </button>
          </LockedTip>
        </div>
      </div>
      {stateError && (
        <p className="api-error tree-notice" role="alert">
          {stateError}
        </p>
      )}
      {locked && (
        <p className="tree-locked-banner" role="note">
          <Icon name="lock" /> Carpeta cerrada · solo lectura. Reábrela para agregar o modificar secciones y
          documentos. La ubicación sí se puede cambiar.
        </p>
      )}
      {notice && (
        <p className="api-success tree-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="api-error tree-notice" role="alert">
          {error}
        </p>
      )}
      {loading && !sections.length ? (
        slow ? (
          <div className="tree-skeleton" role="status" aria-label="Cargando secciones">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="tree-placeholder" aria-hidden="true" />
        )
      ) : tree.length ? (
        <ul className="tree-root">
          {tree.map((section, index) => renderSection(section, 0, index, tree.length))}
        </ul>
      ) : (
        !error && (
          <div className="documents-empty">
            <span aria-hidden="true">
              <Icon name="folderPlus" size={28} />
            </span>
            <h4>Organiza la carpeta en secciones</h4>
            <p>Crea secciones como “Denuncia” o “Resoluciones” y agrega sus documentos y subsecciones.</p>
            <LockedTip locked={locked}>
              <button
                type="button"
                className="primary"
                disabled={locked}
                onClick={() => setSectionDialog({ mode: 'create', parent: null })}
              >
                <Icon name="plus" /> Crear primera sección
              </button>
            </LockedTip>
          </div>
        )
      )}

      {sectionDialog && (
        <Modal
          eyebrow={folderName(folder.name)}
          title={
            sectionDialog.mode === 'edit'
              ? 'Editar sección'
              : sectionDialog.parent
                ? 'Nueva subsección'
                : 'Nueva sección'
          }
          description={
            sectionDialog.mode === 'edit'
              ? 'Cambia sus datos, muévela dentro de esta carpeta o ajusta su orden.'
              : 'El tipo y la fecha se guardan en la sección y aplican a sus documentos.'
          }
          onClose={() => setSectionDialog(null)}
        >
          <SectionForm
            dialog={sectionDialog}
            sections={sections}
            types={types}
            onCancel={() => setSectionDialog(null)}
            onSubmit={saveSection}
          />
        </Modal>
      )}
      {documentDialog && (
        <Modal
          eyebrow={activeSection ? activeSection.name.toUpperCase() : 'DOCUMENTO'}
          title={documentDialog.mode === 'edit' ? 'Editar documento' : 'Agregar documento'}
          description={
            documentDialog.mode === 'edit'
              ? 'Cambia el nombre, la fecha o reemplaza su archivo.'
              : 'Crea un documento nuevo o reutiliza uno ya registrado en el expediente.'
          }
          onClose={() => setDocumentDialog(null)}
        >
          <DocumentForm
            dialog={documentDialog}
            expedienteId={expedienteId}
            sectionDocs={activeSection ? docs[activeSection.id]?.items || [] : []}
            onCancel={() => setDocumentDialog(null)}
            onCreate={(name, date, file, retryId, setRetry, setStatus) =>
              createDocument(activeSection!, name, date, file, retryId, setRetry, setStatus)
            }
            onLink={document => linkDocument(activeSection!, document)}
            onEdit={(name, date, file, setStatus) =>
              editDocument(
                (documentDialog as { document: DocumentRecord }).document,
                name,
                date,
                file,
                setStatus,
              )
            }
          />
        </Modal>
      )}
      {confirm && (
        <Modal title={confirm.title} busy={confirmBusy} size="sm" onClose={() => setConfirm(null)}>
          <div className="case-create-form tree-form">
            <p className="tree-confirm-text">{confirm.message}</p>
            {confirmError && (
              <p className="api-error" role="alert">
                {confirmError}
              </p>
            )}
            <div className="case-create-actions">
              <button
                type="button"
                className="secondary"
                disabled={confirmBusy}
                onClick={() => setConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary tree-danger"
                disabled={confirmBusy}
                onClick={() => void runConfirm()}
              >
                {confirmBusy ? 'Procesando…' : confirm.confirmLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
