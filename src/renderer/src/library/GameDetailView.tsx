import { useState } from 'react'
import type { Achievement, AchievementInput, Game } from '../../../library/model'
import { formatDuration, releaseYear } from '../format'
import AchievementFormModal from './AchievementFormModal'
import { STATUS_LABELS } from './status-labels'

interface GameDetailViewProps {
  game: Game
  achievements: Achievement[]
  achievementsLoading: boolean
  achievementsLoaded: boolean
  onBack: () => void
  onEdit: (game: Game) => void
  onToggleShowcase: (game: Game) => void
  onCreateAchievement: (gameId: number, input: AchievementInput) => Promise<void>
  onUpdateAchievement: (achievement: Achievement, input: AchievementInput) => Promise<void>
  onDeleteAchievement: (achievement: Achievement) => Promise<void>
}

export default function GameDetailView({
  game,
  achievements,
  achievementsLoading,
  achievementsLoaded,
  onBack,
  onEdit,
  onToggleShowcase,
  onCreateAchievement,
  onUpdateAchievement,
  onDeleteAchievement
}: GameDetailViewProps): React.JSX.Element {
  const [achievementForm, setAchievementForm] = useState<Achievement | 'new' | null>(null)
  const [achievementError, setAchievementError] = useState<string | null>(null)
  const hero = game.backgroundUrl ?? game.screenshots[0] ?? game.coverUrl
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length

  async function toggleAchievement(achievement: Achievement): Promise<void> {
    setAchievementError(null)
    try {
      await onUpdateAchievement(achievement, {
        name: achievement.name,
        description: achievement.description,
        iconUrl: achievement.iconUrl,
        unlocked: !achievement.unlocked,
        unlockedAt: null
      })
    } catch (reason) {
      setAchievementError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function removeAchievement(achievement: Achievement): Promise<void> {
    setAchievementError(null)
    try {
      await onDeleteAchievement(achievement)
    } catch (reason) {
      setAchievementError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <article className="game-detail">
      <header
        className="game-hero"
        style={hero ? { backgroundImage: `url("${hero.replaceAll('"', '%22')}")` } : undefined}
      >
        <div className="hero-shade" />
        <button type="button" className="back-button" onClick={onBack}>
          ← Biblioteca
        </button>
        <div className="hero-content">
          <div className="detail-cover">
            {game.coverUrl ? (
              <img src={game.coverUrl} alt={`Portada de ${game.title}`} />
            ) : (
              <span>{game.title.charAt(0)}</span>
            )}
          </div>
          <div className="hero-copy">
            <p className="eyebrow">{game.developers.join(' · ') || 'Ficha personal'}</p>
            <h1 tabIndex={-1} data-view-heading>
              {game.title}
            </h1>
            <div className="detail-tags">
              {game.genres.map((genre) => (
                <span key={genre}>{genre}</span>
              ))}
              {game.releasedAt && <span>{releaseYear(game.releasedAt)}</span>}
              {game.metacritic != null && <span className="meta-score">{game.metacritic}</span>}
            </div>
            <div className="hero-actions">
              <button type="button" className="action-button" onClick={() => onEdit(game)}>
                Editar mi ficha
              </button>
              <button
                type="button"
                className={`showcase-button ${game.showcased ? 'active' : ''}`}
                onClick={() => onToggleShowcase(game)}
                aria-pressed={game.showcased}
              >
                ★ {game.showcased ? 'En el expositor' : 'Destacar'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="detail-section">
            <h2>Acerca del juego</h2>
            <p className="game-description">
              {game.description || 'Esta ficha todavía no tiene descripción.'}
            </p>
          </section>

          <section className="detail-section achievements-section" aria-busy={achievementsLoading}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Progreso personal</p>
                <h2>Logros</h2>
              </div>
              <div className="achievement-heading-actions">
                <strong role="status" aria-live="polite" aria-atomic="true">
                  {unlockedCount} / {achievements.length}
                </strong>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => setAchievementForm('new')}
                  disabled={!achievementsLoaded}
                >
                  Añadir logro
                </button>
              </div>
            </div>
            {achievementError && (
              <p className="modal-error" role="alert">
                {achievementError}
              </p>
            )}
            {achievementsLoading ? (
              <p className="achievement-empty" role="status">
                Cargando logros…
              </p>
            ) : !achievementsLoaded ? (
              <p className="achievement-empty" role="alert">
                No se pudieron cargar los logros. Vuelve a abrir la ficha para reintentar.
              </p>
            ) : achievements.length ? (
              <div className="achievement-list">
                {achievements.map((achievement) => (
                  <article
                    key={achievement.id}
                    className={`achievement-card ${achievement.unlocked ? 'unlocked' : ''}`}
                  >
                    <div className="achievement-icon">
                      {achievement.iconUrl ? (
                        <img src={achievement.iconUrl} alt="" />
                      ) : (
                        <span>{achievement.unlocked ? '✓' : '◇'}</span>
                      )}
                    </div>
                    <div className="achievement-copy">
                      <strong>{achievement.name}</strong>
                      {achievement.description && <p>{achievement.description}</p>}
                      <small>
                        {achievement.unlocked
                          ? achievement.unlockedAt
                            ? `Desbloqueado el ${new Date(`${achievement.unlockedAt}T00:00:00`).toLocaleDateString('es')}`
                            : 'Desbloqueado'
                          : 'Bloqueado'}
                      </small>
                    </div>
                    <div className="achievement-actions">
                      <button
                        type="button"
                        aria-label={`${achievement.unlocked ? 'Volver a bloquear' : 'Desbloquear'} ${achievement.name}`}
                        onClick={() => void toggleAchievement(achievement)}
                      >
                        {achievement.unlocked ? 'Volver a bloquear' : 'Desbloquear'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Editar ${achievement.name}`}
                        onClick={() => setAchievementForm(achievement)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="danger-link"
                        aria-label={`Eliminar ${achievement.name}`}
                        onClick={() => void removeAchievement(achievement)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="achievement-empty">Añade logros propios para registrar tu progreso.</p>
            )}
          </section>

          {game.screenshots.length > 0 && (
            <section className="detail-section">
              <div className="section-heading">
                <h2>Capturas</h2>
                <span>{game.screenshots.length}</span>
              </div>
              <div className="screenshot-strip">
                {game.screenshots.map((screenshot, index) => (
                  <img
                    key={screenshot}
                    src={screenshot}
                    alt={`Captura ${index + 1} de ${game.title}`}
                  />
                ))}
              </div>
            </section>
          )}

          {game.notes && (
            <section className="detail-section personal-notes">
              <p className="eyebrow">Notas personales</p>
              <p>{game.notes}</p>
            </section>
          )}
        </div>

        <aside className="detail-sidebar">
          <section className="personal-panel">
            <p className="eyebrow">Mi progreso</p>
            <strong className={`personal-status status-text-${game.status}`}>
              {STATUS_LABELS[game.status]}
            </strong>
            <dl>
              <div>
                <dt>Tiempo jugado</dt>
                <dd>{formatDuration(game.playtimeMinutes)}</dd>
              </div>
              <div>
                <dt>Mi puntuación</dt>
                <dd>{game.rating ? `${game.rating} / 10` : 'Sin puntuar'}</dd>
              </div>
              <div>
                <dt>Añadido</dt>
                <dd>{new Date(`${game.addedAt}Z`).toLocaleDateString('es')}</dd>
              </div>
            </dl>
          </section>

          <section className="facts-panel">
            <h2>Información</h2>
            <dl>
              <div>
                <dt>Desarrollador</dt>
                <dd>{game.developers.join(', ') || 'Sin datos'}</dd>
              </div>
              <div>
                <dt>Distribuidor</dt>
                <dd>{game.publishers.join(', ') || 'Sin datos'}</dd>
              </div>
              <div>
                <dt>Plataformas</dt>
                <dd>{game.platforms.join(', ') || 'Sin datos'}</dd>
              </div>
            </dl>
            {game.website && (
              <a href={game.website} target="_blank" rel="noreferrer">
                Sitio oficial ↗
              </a>
            )}
            {game.source === 'rawg' && (
              <a className="rawg-credit" href="https://rawg.io/" target="_blank" rel="noreferrer">
                Datos e imágenes: RAWG ↗
              </a>
            )}
            {game.source === 'steam' && (
              <a
                className="rawg-credit"
                href={`https://store.steampowered.com/app/${game.catalogId}`}
                target="_blank"
                rel="noreferrer"
              >
                Datos e imágenes: Steam ↗
              </a>
            )}
          </section>
        </aside>
      </div>
      {achievementForm && (
        <AchievementFormModal
          gameTitle={game.title}
          achievement={achievementForm === 'new' ? null : achievementForm}
          onSave={(input) =>
            achievementForm === 'new'
              ? onCreateAchievement(game.id, input)
              : onUpdateAchievement(achievementForm, input)
          }
          onClose={() => setAchievementForm(null)}
        />
      )}
    </article>
  )
}
