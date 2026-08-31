import { useState, type FormEvent } from 'react'
import type { Game, LibraryStats, Profile } from '../../../library/model'
import { formatDuration } from '../format'
import { STATUS_LABELS } from '../library/status-labels'

interface ProfileViewProps {
  profile: Profile
  stats: LibraryStats
  games: Game[]
  onOpenGame: (game: Game) => void
  onUpdateProfile: (input: Profile) => Promise<void>
}

function levelFromCompleted(completed: number): { level: number; progress: number } {
  return { level: 1 + Math.floor(completed / 5), progress: (completed % 5) * 20 }
}

export default function ProfileView({
  profile,
  stats,
  games,
  onOpenGame,
  onUpdateProfile
}: ProfileViewProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [about, setAbout] = useState('')
  const [location, setLocation] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const showcased = games.filter((game) => game.showcased).slice(0, 6)
  const completed = games
    .filter((game) => game.status === 'completado')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 6)
  const playing = games.filter((game) => game.status === 'jugando').slice(0, 4)
  const genreCounts = new Map<string, number>()
  for (const game of games) {
    for (const genre of game.genres) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
  }
  const favoriteGenres = [...genreCounts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre)
  const { level, progress } = levelFromCompleted(stats.completed)
  const completionRate = stats.totalGames
    ? Math.round((stats.completed / stats.totalGames) * 100)
    : 0
  const backdrop = profile.backgroundUrl ?? showcased[0]?.backgroundUrl ?? games[0]?.backgroundUrl

  function startEditing(): void {
    setDisplayName(profile.displayName)
    setAbout(profile.about)
    setLocation(profile.location)
    setAvatarUrl(profile.avatarUrl ?? '')
    setBackgroundUrl(profile.backgroundUrl ?? '')
    setEditing(true)
  }

  async function saveProfile(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setProfileError(null)
    try {
      await onUpdateProfile({
        displayName,
        about,
        location,
        avatarUrl: avatarUrl || null,
        backgroundUrl: backgroundUrl || null
      })
      setEditing(false)
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="profile-page"
      style={
        backdrop
          ? ({
              '--profile-backdrop': `url("${backdrop.replaceAll('"', '%22')}")`
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="profile-backdrop" />
      <div className="profile-shell">
        <header className="profile-identity">
          <div className="profile-avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={`Avatar de ${profile.displayName}`} />
            ) : (
              <span>{profile.displayName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="identity-copy">
            <p className="eyebrow">Perfil de GameVault</p>
            <h1>{profile.displayName}</h1>
            {profile.location && <span className="profile-location">⌖ {profile.location}</span>}
            <p>{profile.about || 'Una colección todavía por descubrir.'}</p>
          </div>
          <div className="profile-level">
            <div className="level-ring">
              <span>{level}</span>
            </div>
            <div>
              <strong>Nivel {level}</strong>
              <small>{stats.completed % 5} de 5 completados para subir</small>
              <div className="level-track">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
          <button type="button" className="profile-edit" onClick={startEditing}>
            Modificar perfil
          </button>
        </header>

        <div className="profile-columns">
          <main className="profile-primary">
            <section className="profile-module year-summary">
              <header>
                <span>Resumen de la colección</span>
                <small>Actualizado localmente</small>
              </header>
              <div className="summary-content">
                <div className="summary-number">
                  <strong>{stats.totalGames}</strong>
                  <span>juegos</span>
                </div>
                <div className="summary-metrics">
                  <div>
                    <strong>{stats.completed}</strong>
                    <span>completados</span>
                  </div>
                  <div>
                    <strong>{completionRate}%</strong>
                    <span>finalizado</span>
                  </div>
                  <div>
                    <strong>{formatDuration(stats.totalPlaytimeMinutes)}</strong>
                    <span>registradas</span>
                  </div>
                </div>
                <div className="summary-covers">
                  {games.slice(0, 5).map((game) => (
                    <button key={game.id} type="button" onClick={() => onOpenGame(game)}>
                      {game.coverUrl ? (
                        <img src={game.coverUrl} alt={game.title} />
                      ) : (
                        <span>{game.title[0]}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="profile-module showcase-module">
              <header>
                <span>Expositor destacado</span>
                <small>{showcased.length} seleccionados</small>
              </header>
              {showcased.length ? (
                <div className="profile-showcase">
                  {showcased.map((game) => (
                    <button key={game.id} type="button" onClick={() => onOpenGame(game)}>
                      <div>
                        {game.coverUrl ? (
                          <img src={game.coverUrl} alt="" />
                        ) : (
                          <span>{game.title[0]}</span>
                        )}
                      </div>
                      <strong>{game.title}</strong>
                      <small>{STATUS_LABELS[game.status]}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="module-empty">
                  Destaca juegos desde su ficha para construir este expositor.
                </p>
              )}
            </section>

            <section className="profile-module completed-module">
              <header>
                <span>Completados recientemente</span>
                <small>{stats.completed} en total</small>
              </header>
              {completed.length ? (
                <div className="completed-grid">
                  {completed.map((game) => (
                    <button key={game.id} type="button" onClick={() => onOpenGame(game)}>
                      {game.coverUrl ? (
                        <img src={game.coverUrl} alt="" />
                      ) : (
                        <span>{game.title[0]}</span>
                      )}
                      <strong>{game.title}</strong>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="module-empty">Cuando completes un juego aparecerá aquí.</p>
              )}
            </section>
          </main>

          <aside className="profile-sidebar">
            <section className="side-module collection-stats">
              <h2>Biblioteca</h2>
              <dl>
                <div>
                  <dt>Juegos</dt>
                  <dd>{stats.totalGames}</dd>
                </div>
                <div>
                  <dt>Completados</dt>
                  <dd>{stats.completed}</dd>
                </div>
                <div>
                  <dt>Jugando</dt>
                  <dd>{stats.playing}</dd>
                </div>
                <div>
                  <dt>Logros</dt>
                  <dd>
                    {stats.unlockedAchievements} / {stats.totalAchievements}
                  </dd>
                </div>
                <div>
                  <dt>Horas registradas</dt>
                  <dd>{Math.floor(stats.totalPlaytimeMinutes / 60)}</dd>
                </div>
              </dl>
            </section>

            <section className="side-module">
              <h2>Jugando ahora</h2>
              {playing.length ? (
                <div className="playing-list">
                  {playing.map((game) => (
                    <button key={game.id} type="button" onClick={() => onOpenGame(game)}>
                      {game.coverUrl ? (
                        <img src={game.coverUrl} alt="" />
                      ) : (
                        <span>{game.title[0]}</span>
                      )}
                      <div>
                        <strong>{game.title}</strong>
                        <small>{formatDuration(game.playtimeMinutes)}</small>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="side-empty">Nada activo ahora mismo.</p>
              )}
            </section>

            <section className="side-module">
              <h2>Géneros frecuentes</h2>
              {favoriteGenres.length ? (
                <div className="genre-cloud">
                  {favoriteGenres.map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>
              ) : (
                <p className="side-empty">Importa fichas para calcularlos.</p>
              )}
            </section>
          </aside>
        </div>
        <div className="view-credits profile-credit">
          {games.some((game) => game.source === 'steam') && (
            <a href="https://store.steampowered.com/" target="_blank" rel="noreferrer">
              Datos e imágenes: Steam ↗
            </a>
          )}
          {games.some((game) => game.source === 'rawg') && (
            <a href="https://rawg.io/" target="_blank" rel="noreferrer">
              Datos e imágenes: RAWG ↗
            </a>
          )}
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <form
            className="edit-modal profile-editor"
            onSubmit={saveProfile}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Personalización</p>
                <h2>Modificar perfil</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setEditing(false)}>
                ×
              </button>
            </header>
            <label className="field">
              <span>Nombre</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Ubicación</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Galicia, España"
              />
            </label>
            <label className="field">
              <span>Sobre mí</span>
              <textarea rows={4} value={about} onChange={(event) => setAbout(event.target.value)} />
            </label>
            <label className="field">
              <span>URL del avatar</span>
              <input
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="field">
              <span>URL del fondo</span>
              <input
                type="url"
                value={backgroundUrl}
                onChange={(event) => setBackgroundUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            {profileError && <p className="modal-error">{profileError}</p>}
            <footer className="modal-footer">
              <span className="spacer" />
              <button type="button" className="quiet-button" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button type="submit" className="action-button" disabled={saving}>
                Guardar perfil
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  )
}
