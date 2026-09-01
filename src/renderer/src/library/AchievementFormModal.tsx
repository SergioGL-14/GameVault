import { useState, type FormEvent } from 'react'
import type { Achievement, AchievementInput } from '../../../library/model'
import Modal from '../dialog/Modal'
import { formatError } from '../format'

interface AchievementFormModalProps {
  gameTitle: string
  achievement: Achievement | null
  onSave: (input: AchievementInput) => Promise<void>
  onClose: () => void
}

export default function AchievementFormModal({
  gameTitle,
  achievement,
  onSave,
  onClose
}: AchievementFormModalProps): React.JSX.Element {
  const [name, setName] = useState(achievement?.name ?? '')
  const [description, setDescription] = useState(achievement?.description ?? '')
  const [iconUrl, setIconUrl] = useState(achievement?.iconUrl ?? '')
  const [unlocked, setUnlocked] = useState(achievement?.unlocked ?? false)
  const [unlockedAt, setUnlockedAt] = useState(achievement?.unlockedAt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({
        name,
        description,
        iconUrl: iconUrl || null,
        unlocked,
        unlockedAt: unlocked && unlockedAt ? unlockedAt : null
      })
      onClose()
    } catch (reason) {
      setError(formatError(reason))
      setBusy(false)
    }
  }

  function requestClose(): void {
    if (!busy) onClose()
  }

  return (
    <Modal
      className="edit-modal achievement-modal"
      labelledBy="achievement-modal-title"
      onClose={requestClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">{gameTitle}</p>
            <h2 id="achievement-modal-title">{achievement ? 'Editar logro' : 'Nuevo logro'}</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={requestClose}
            aria-label="Cerrar"
            disabled={busy}
          >
            ×
          </button>
        </header>
        <div className="edit-form-grid">
          <label className="field field-wide">
            <span>Nombre del logro</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="field field-wide">
            <span>Descripción</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="field field-wide">
            <span>URL del icono</span>
            <input
              type="url"
              value={iconUrl}
              onChange={(event) => setIconUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={unlocked}
              onChange={(event) => {
                setUnlocked(event.target.checked)
                if (!event.target.checked) setUnlockedAt('')
              }}
            />
            Desbloqueado
          </label>
          <label className="field">
            <span>Fecha de desbloqueo</span>
            <input
              type="date"
              value={unlockedAt}
              onChange={(event) => setUnlockedAt(event.target.value)}
              disabled={!unlocked}
            />
          </label>
        </div>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <span className="spacer" />
          <button type="button" className="quiet-button" onClick={requestClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="action-button" disabled={busy}>
            {achievement ? 'Guardar logro' : 'Crear logro'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
