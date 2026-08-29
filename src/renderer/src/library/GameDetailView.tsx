import type { Game } from '../../../library/model'
import { formatDuration, releaseYear } from '../format'
import { STATUS_LABELS } from './status-labels'

interface GameDetailViewProps {
  game: Game
  onBack: () => void
  onEdit: (game: Game) => void
  onToggleShowcase: (game: Game) => void
}

export default function GameDetailView({
  game,
  onBack,
  onEdit,
  onToggleShowcase
}: GameDetailViewProps): React.JSX.Element {
  const hero = game.backgroundUrl ?? game.screenshots[0] ?? game.coverUrl

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
            <h1>{game.title}</h1>
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
              >
                ★ {game.showcased ? 'En el expositor' : 'Destacar'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="detail-layout">
        <main className="detail-main">
          <section className="detail-section">
            <h2>Acerca del juego</h2>
            <p className="game-description">
              {game.description || 'Esta ficha todavía no tiene descripción.'}
            </p>
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
        </main>

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
    </article>
  )
}
