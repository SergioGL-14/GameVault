import { useState, type FormEvent } from 'react'
import { GAME_STATUSES, type Game, type GameStatus } from '../../../library/model'
import { gameToInput } from './game-input'
import { STATUS_LABELS } from './status-labels'

interface GameFormModalProps {
  game: Game
  onSave: (game: Game, input: ReturnType<typeof gameToInput>) => Promise<void>
  onDelete: (game: Game) => Promise<void>
  onClose: () => void
}

export default function GameFormModal({
  game,
  onSave,
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
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(game, {
        ...gameToInput(game),
        title,
        status,
        playtimeMinutes: Number(playtime),
        rating: rating ? Number(rating) : null,
        notes,
        coverUrl: coverUrl || null,
        showcased
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="edit-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">Ficha personal</p>
            <h2>{game.title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="edit-form-grid">
          <label className="field field-wide">
            <span>Título</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
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
          <label className="field field-wide">
            <span>URL de carátula</span>
            <input
              type="url"
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
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
        {error && <p className="modal-error">{error}</p>}
        <footer className="modal-footer">
          <button type="button" className="danger-button" onClick={() => onDelete(game)}>
            Eliminar de la biblioteca
          </button>
          <span className="spacer" />
          <button type="button" className="quiet-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="action-button" disabled={busy}>
            Guardar cambios
          </button>
        </footer>
      </form>
    </div>
  )
}
