import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  expedientesService,
  folderName,
  foldersService,
  formatPeruDateTime,
  formatPeruDay,
  historyEventLabels,
  locationLabel,
  peruDate,
  statusLabel,
  todayInPeru,
} from '../services/api'
import type { HistoryEvent, HistoryPage } from '../services/api'
import Modal from './Modal'

const pageSize = 20

const peruTime = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', timeStyle: 'short' })
function timeOf(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : peruTime.format(date)
}
function dayLabel(day: string) {
  const today = todayInPeru()
  const yesterday = new Date(today + 'T00:00:00Z')
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  if (day === today) return 'Hoy'
  if (day === yesterday.toISOString().slice(0, 10)) return 'Ayer'
  return formatPeruDay(day, 'long') || 'Sin fecha'
}

// Tipo visual de cada evento: define su ícono y color.
type Kind = 'open' | 'closed' | 'location' | 'description' | 'other'
function kindOf(event: string): Kind {
  if (event.endsWith('_ABIERTO') || event.endsWith('_ABIERTA')) return 'open'
  if (event.endsWith('_CERRADO') || event.endsWith('_CERRADA')) return 'closed'
  if (event.includes('UBICACION')) return 'location'
  if (event.includes('DESCRIPCION')) return 'description'
  return 'other'
}
const kindIcons: Record<Kind, ReactNode> = {
  open: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  closed: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  description: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  other: <circle cx="12" cy="12" r="3" />,
}

// Historial de solo lectura: de todo el expediente o de una sola carpeta.
export default function HistoryDialog({
  expedienteId,
  folder,
  onClose,
}: {
  expedienteId: number
  // Sin carpeta se muestran los eventos del expediente y de todas sus carpetas.
  folder?: { id: number; name: string } | null
  onClose: () => void
}) {
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const folderId = folder?.id ?? null
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    const load =
      folderId === null
        ? expedientesService.history(expedienteId, pageSize, offset)
        : foldersService.history(expedienteId, folderId, pageSize, offset)
    load
      .then(result => {
        if (current) setPage(result)
      })
      .catch(caught => {
        if (current) setError(caught instanceof Error ? caught.message : 'No se pudo cargar el historial.')
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [expedienteId, folderId, offset, attempt])

  const rows = page?.data ?? []
  const total = page?.total ?? 0
  // Agrupa por día en Perú; el backend ya los envía del más reciente al más antiguo.
  const days: { day: string; items: HistoryEvent[] }[] = []
  for (const item of rows) {
    const day = peruDate(item.changed_at)
    const last = days[days.length - 1]
    if (last && last.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return (
    <Modal
      eyebrow={folder ? folderName(folder.name).toUpperCase() : 'EXPEDIENTE'}
      title="Historial"
      description={
        folder
          ? 'Aperturas, cierres y cambios de ubicación de esta carpeta.'
          : 'Eventos del expediente y de todas sus carpetas.'
      }
      onClose={onClose}
    >
      <div className="history-body">
        {error ? (
          <p className="api-error" role="alert">
            {error}{' '}
            <button type="button" className="row-link" onClick={() => setAttempt(value => value + 1)}>
              Reintentar
            </button>
          </p>
        ) : loading && !page ? (
          <p className="history-empty" role="status">
            Cargando historial…
          </p>
        ) : rows.length ? (
          <div className={`history-days${loading ? ' is-refreshing' : ''}`}>
            {days.map(group => (
              <section key={group.day} className="history-day">
                <h3 className="history-day-label">{dayLabel(group.day)}</h3>
                <ol className="history-list">
                  {group.items.map(item => (
                    <HistoryItem key={item.id} item={item} showFolder={!folder} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p className="history-empty">Aún no hay eventos registrados.</p>
        )}
        {total > pageSize && (
          <div className="history-footer">
            <span>
              {offset + 1}–{Math.min(offset + rows.length, total)} de {total}
            </span>
            <div>
              <button
                type="button"
                className="secondary"
                disabled={loading || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
              >
                Más recientes
              </button>
              <button
                type="button"
                className="secondary"
                disabled={loading || offset + pageSize >= total}
                onClick={() => setOffset(offset + pageSize)}
              >
                Anteriores
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function HistoryItem({ item, showFolder }: { item: HistoryEvent; showFolder: boolean }) {
  const isFolder = item.folder_id !== null
  const kind = kindOf(item.event)
  // Expediente: fechas calendario. Carpeta: el cierre es un instante con hora.
  const opening = formatPeruDay(item.opening_date)
  const closing = isFolder ? formatPeruDateTime(item.closing_date) : formatPeruDay(item.closing_date)
  const location = item.location ? locationLabel(item.location) : null
  return (
    <li className="history-item" data-kind={kind}>
      <span className="history-icon" aria-hidden="true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {kindIcons[kind]}
        </svg>
      </span>
      <div className="history-card">
        <div className="history-title">
          <strong>{historyEventLabels[item.event] || item.event}</strong>
          <time dateTime={item.changed_at} title={formatPeruDateTime(item.changed_at)}>
            {timeOf(item.changed_at)}
          </time>
        </div>
        {isFolder && showFolder && (
          <p className="history-folder">{item.folder_name ? folderName(item.folder_name) : `Carpeta #${item.folder_id}`}</p>
        )}
        <div className="history-meta">
          <span className="status" data-status={item.status}>
            {statusLabel(item.status)}
          </span>
          {isFolder && (
            <span className={`history-chip${location ? '' : ' is-empty'}`}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {kindIcons.location}
              </svg>
              {location || 'Sin información histórica'}
            </span>
          )}
        </div>
        <dl className="history-dates">
          <div>
            <dt>Apertura</dt>
            <dd>{opening || 'Sin fecha'}</dd>
          </div>
          {closing && (
            <div>
              <dt>Cierre</dt>
              <dd>{closing}</dd>
            </div>
          )}
        </dl>
      </div>
    </li>
  )
}
