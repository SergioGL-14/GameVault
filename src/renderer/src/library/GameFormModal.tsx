import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CatalogResult } from '../../../catalog/model'
import { GAME_STATUSES, type Game, type GameStatus } from '../../../library/model'
import { catalogFailureMessage } from '../catalog/catalog-failure'
import Modal from '../dialog/Modal'
import { formatError } from '../format'
import { gameToInput } from './game-input'
import { STATUS_LABELS } from './status-labels'

interface GameFormModalProps {
  game: Game
  backgroundMetadataBusy: boolean
  onSave: (game: Game, input: ReturnType<typeof gameToInput>) => Promise<void>
  onRefreshMetadata: (game: Game) => Promise<CatalogResult<Game>>
  onDelete: (game: Game) => Promise<void>
  onClose: () => void
}

export default function GameFormModal({
  game,
  backgroundMetadataBusy,
  onSave,
  onRefreshMetadata,
  onDelete,
  onClose
}: GameFormModalProps): React.JSX.Element {
  const [title, setTitle] = useState(game.title)
  const [status, setStatus] = useState<GameStatus>(game.status)
  const [playtime, setPlaytime] = useState(String(game.playtimeMinutes))
  const [rating, setRating] = useState(game.rating != null ? String(game.rating) : '')
  const [notes, setNotes] = useState(game.notes)
  const [coverUrl, setCoverUrl] = useState(game.coverUrl ?? '')
  const [showcased, setShowcased] = useState(game.showcased)
  const [busy, setBusy] = useState(false)
  const [selectingImage, setSelectingImage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const titleEdited = useRef(false)
  const coverEdited = useRef(false)

  useEffect(() => {
    if (!titleEdited.current) setTitle(game.title)
  }, [game.title])

  useEffect(() => {
    if (!coverEdited.current) setCoverUrl(game.coverUrl ?? '')
  }, [game.coverUrl])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (backgroundMetadataBusy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(game, {
        ...gameToInput(game),
        title: titleEdited.current ? title : game.title,
        status,
        playtimeMinutes: Number(playtime),
        rating: rating ? Number(rating) : null,
        notes,
        coverUrl: coverEdited.current ? coverUrl || null : game.coverUrl,
        showcased
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(false)
    }
  }

  async function remove(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await onDelete(game)
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function selectCover(): Promise<void> {
    setBusy(true)
    setSelectingImage(true)
    setError(null)
    try {
      const selected = await window.api.selectLocalImage()
      if (selected !== null) {
        coverEdited.current = true
        setCoverUrl(selected)
      }
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setSelectingImage(false)
      setBusy(false)
    }
  }

  async function refreshMetadata(): Promise<void> {
    setBusy(true)
    setError(null)
    setMessage('Actualizando metadatos…')
    const previousTitle = game.title
    const previousCover = game.coverUrl ?? ''
    try {
      const result = await onRefreshMetadata(game)
      if (!result.ok) {
        setError(catalogFailureMessage(result.error))
        setMessage(null)
        return
      }
      setTitle((current) => (current === previousTitle ? result.value.title : current))
      setCoverUrl((current) =>
        current === previousCover ? (result.value.coverUrl ?? '') : current
      )
      setMessage('Metadatos actualizados.')
    } catch (reason) {
      setError(formatError(reason))
      setMessage(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal className="edit-modal" labelledBy="game-modal-title" onClose={onClose} busy={busy}>
      <form onSubmit={submit} aria-busy={busy}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">Ficha personal</p>
            <h2 id="game-modal-title">{game.title}</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={busy}
          >
            ×
          </button>
        </header>
        <div className="edit-form-grid">
          <label className="field field-wide">
            <span>Título</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => {
                titleEdited.current = true
                setTitle(event.target.value)
              }}
              required
            />
          </label>
          <label className="field">
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as GameStatus)}
            >
              {GAME_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tiempo jugado (minutos)</span>
            <input
              type="number"
              min={0}
              value={playtime}
              onChange={(event) => setPlaytime(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Puntuación personal</span>
            <select value={rating} onChange={(event) => setRating(event.target.value)}>
              <option value="">Sin puntuar</option>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value} / 10
                </option>
              ))}
            </select>
          </label>
          <div className="image-field field-wide">
            <label className="field">
              <span>URL de carátula</span>
              <input
                type="url"
                value={coverUrl}
                onChange={(event) => {
                  coverEdited.current = true
                  setCoverUrl(event.target.value)
                }}
                placeholder="https://…"
                disabled={busy}
              />
            </label>
            <div className="image-actions">
              <button
                type="button"
                className="quiet-button"
                aria-label="Elegir archivo para la carátula"
                onClick={() => void selectCover()}
                disabled={busy}
              >
                {selectingImage ? 'Eligiendo…' : 'Elegir archivo'}
              </button>
              <button
                type="button"
                className="text-button"
                aria-label="Quitar carátula"
                onClick={() => {
                  coverEdited.current = true
                  setCoverUrl('')
                }}
                disabled={busy || !coverUrl}
              >
                Quitar imagen
              </button>
            </div>
          </div>
          <label className="field field-wide">
            <span>Notas personales</span>
            <textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label className="check-field field-wide">
            <input
              type="checkbox"
              checked={showcased}
              onChange={(event) => setShowcased(event.target.checked)}
            />
            Destacar este juego en el perfil
          </label>
        </div>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="modal-status" role="status" aria-live="polite">
            {message}
          </p>
        )}
        <footer className="modal-footer">
          {game.source !== 'manual' && game.catalogId !== null && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => void refreshMetadata()}
              disabled={busy}
            >
              Actualizar metadatos
            </button>
          )}
          <button type="button" className="danger-button" onClick={remove} disabled={busy}>
            Eliminar de la biblioteca
          </button>
          <span className="spacer" />
          <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="action-button" disabled={busy || backgroundMetadataBusy}>
            Guardar cambios
          </button>
        </footer>
      </form>
    </Modal>
  )
}
