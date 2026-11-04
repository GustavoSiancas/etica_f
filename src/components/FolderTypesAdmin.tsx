import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { folderName, foldersService } from '../services/api'
import type { FolderType } from '../services/api'
import './FolderTypesAdmin.css'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.'

function FolderIcon({ size = 18 }: { size?: number }) {
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
      <path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}

// Admin: catálogo de tipos de carpeta que luego se usan al añadir carpetas a un expediente.
export default function FolderTypesAdmin() {
  const [types, setTypes] = useState<FolderType[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<FolderType | null>(null)

  useEffect(() => {
    let current = true
    setLoadError('')
    foldersService
      .types()
      .then(rows => {
        if (current) setTypes(rows)
      })
      .catch(caught => {
        if (current) {
          setLoadError(errorMessage(caught))
          setTypes(rows => rows ?? [])
        }
      })
    return () => {
      current = false
    }
  }, [refresh])

  useEffect(() => {
    if (!created) return
    const timer = setTimeout(() => setCreated(null), 4000)
    return () => clearTimeout(timer)
  }, [created])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const type = await foldersService.createType(name)
      setTypes(rows => [...(rows || []).filter(row => row.id !== type.id), type])
      setCreated(type)
      setName('')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const sorted = [...(types || [])].sort((a, b) => a.id - b.id)
  return (
    <section className="folder-types-admin">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN</p>
          <h1>Tipos de carpeta</h1>
          <p>Los tipos que crees aquí aparecen al añadir una carpeta dentro de un expediente.</p>
        </div>
      </div>

      <div className="folder-types-layout">
        <form className="folder-types-card folder-types-form" onSubmit={submit}>
          <h2>Añadir tipo de carpeta</h2>
          <label htmlFor="folder-type-name">
            Nombre <b>*</b>
          </label>
          <input
            id="folder-type-name"
            required
            maxLength={255}
            value={name}
            disabled={saving}
            placeholder="Ej. Expediente especial"
            onChange={event => setName(event.target.value)}
          />
          <small>Se guarda en mayúsculas. No se permiten nombres repetidos.</small>
          {error && (
            <p className="api-error" role="alert">
              {error}
            </p>
          )}
          {created && (
            <p className="api-success" role="status">
              Tipo “{folderName(created.name)}” creado.
            </p>
          )}
          <button className="primary" disabled={saving || !name.trim()}>
            {saving ? 'Añadiendo…' : '+ Añadir tipo'}
          </button>
        </form>

        <div className="folder-types-card">
          <div className="folder-types-list-heading">
            <h2>Tipos registrados</h2>
            <span className="folder-types-count">{types ? types.length : '…'}</span>
          </div>
          {loadError && (
            <p className="api-error" role="alert">
              {loadError}{' '}
              <button type="button" className="row-link" onClick={() => setRefresh(value => value + 1)}>
                Reintentar
              </button>
            </p>
          )}
          {types === null ? (
            <p className="folder-types-empty" role="status">
              Cargando tipos…
            </p>
          ) : sorted.length ? (
            <ul className="folder-types-list">
              {sorted.map(type => (
                <li key={type.id} className={created?.id === type.id ? 'is-new' : ''}>
                  <span className="folder-types-icon">
                    <FolderIcon />
                  </span>
                  <strong>{folderName(type.name)}</strong>
                  <small>ID {type.id}</small>
                </li>
              ))}
            </ul>
          ) : (
            !loadError && <p className="folder-types-empty">Aún no hay tipos de carpeta.</p>
          )}
        </div>
      </div>
    </section>
  )
}
