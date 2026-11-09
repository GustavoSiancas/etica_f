import { useEffect, useState } from 'react'
import {
  expedientesService,
  folderName,
  foldersService,
  formatPeruDateTime,
  formatPeruDay,
  historyEventLabels,
  locationLabel,
  statusLabel,
} from '../services/api'
import type { HistoryEvent, HistoryPage } from '../services/api'
import Modal from './Modal'

const pageSize = 20

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
  return (
    <Modal
      eyebrow={folder ? `CARPETA · ${folderName(folder.name).toUpperCase()}` : 'EXPEDIENTE'}
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
          <p className="detail-empty" role="status">
            Cargando historial…
          </p>
        ) : rows.length ? (
          <ol className={`history-list${loading ? ' is-refreshing' : ''}`}>
            {rows.map(item => (
              <HistoryItem key={item.id} item={item} showFolder={!folder} />
            ))}
          </ol>
        ) : (
          <p className="detail-empty">Aún no hay eventos registrados.</p>
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
  // Expediente: fechas calendario (medianoche de Perú). Carpeta: el cierre es un instante con hora.
  const opening = formatPeruDay(item.opening_date)
  const closing = isFolder ? formatPeruDateTime(item.closing_date) : formatPeruDay(item.closing_date)
  return (
    <li className="history-item" data-event={item.event}>
      <span className="history-marker" data-status={item.status} aria-hidden="true" />
      <div className="history-main">
        <div className="history-title">
          <strong>{historyEventLabels[item.event] || item.event}</strong>
          <time dateTime={item.changed_at}>{formatPeruDateTime(item.changed_at)}</time>
        </div>
        <dl className="history-facts">
          {isFolder && showFolder && (
            <div>
              <dt>Carpeta</dt>
              <dd>{item.folder_name ? folderName(item.folder_name) : `#${item.folder_id}`}</dd>
            </div>
          )}
          <div>
            <dt>Estado</dt>
            <dd>
              <span className="status" data-status={item.status}>
                {statusLabel(item.status)}
              </span>
            </dd>
          </div>
          {isFolder && (
            <div>
              <dt>Ubicación</dt>
              <dd className={item.location ? '' : 'is-empty'}>
                {item.location ? locationLabel(item.location) : 'Sin información histórica'}
              </dd>
            </div>
          )}
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
