import { useCallback, useEffect, useState } from 'react'
import type { Game, GameInput, LibraryStats, Profile, ProfileInput } from '../../library/model'
import AddGameModal from './catalog/AddGameModal'
import { formatError } from './format'
import GameDetailView from './library/GameDetailView'
import GameFormModal from './library/GameFormModal'
import LibraryView from './library/LibraryView'
import { gameToInput } from './library/game-input'
import ProfileView from './profile/ProfileView'

type Tab = 'perfil' | 'biblioteca'

async function fetchAll(): Promise<[Game[], Profile, LibraryStats]> {
  return Promise.all([window.api.listGames(), window.api.getProfile(), window.api.getStats()])
}

const emptyProfile: Profile = {
  displayName: 'Jugador',
  about: '',
  location: '',
  avatarUrl: null,
  backgroundUrl: null
}

function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('perfil')
  const [games, setGames] = useState<Game[]>([])
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [stats, setStats] = useState<LibraryStats>({
    totalGames: 0,
    completed: 0,
    playing: 0,
    totalPlaytimeMinutes: 0
  })
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editGame, setEditGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextGames, nextProfile, nextStats] = await fetchAll()
      setGames(nextGames)
      setProfile(nextProfile)
      setStats(nextStats)
      setError(null)
    } catch (reason) {
      setError(formatError(reason))
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchAll()
      .then(([nextGames, nextProfile, nextStats]) => {
        if (!active) return
        setGames(nextGames)
        setProfile(nextProfile)
        setStats(nextStats)
      })
      .catch((reason: unknown) => {
        if (active) setError(formatError(reason))
      })
    return () => {
      active = false
    }
  }, [])

  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null

  function openGame(game: Game): void {
    setTab('biblioteca')
    setSelectedGameId(game.id)
  }

  async function createGame(input: GameInput): Promise<Game> {
    const created = await window.api.createGame(input)
    setAddOpen(false)
    setSelectedGameId(created.id)
    await refresh()
    return created
  }

  async function updateGame(game: Game, input: GameInput): Promise<void> {
    await window.api.updateGame(game.id, input)
    setEditGame(null)
    await refresh()
  }

  async function deleteGame(game: Game): Promise<void> {
    if (!window.confirm(`¿Eliminar "${game.title}" de tu biblioteca?`)) return
    await window.api.deleteGame(game.id)
    setEditGame(null)
    setSelectedGameId(null)
    await refresh()
  }

  async function toggleShowcase(game: Game): Promise<void> {
    try {
      await window.api.updateGame(game.id, {
        ...gameToInput(game),
        showcased: !game.showcased
      })
      await refresh()
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  async function updateProfile(input: ProfileInput): Promise<void> {
    setProfile(await window.api.updateProfile(input))
  }

  return (
    <div className="app">
      <nav className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => {
            setTab('perfil')
            setSelectedGameId(null)
          }}
        >
          <span className="brand-mark">G</span>
          <span>GAMEVAULT</span>
        </button>
        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === 'perfil' && !selectedGame ? 'active' : ''}`}
            onClick={() => {
              setTab('perfil')
              setSelectedGameId(null)
            }}
          >
            PERFIL
          </button>
          <button
            type="button"
            className={`tab ${tab === 'biblioteca' ? 'active' : ''}`}
            onClick={() => {
              setTab('biblioteca')
              setSelectedGameId(null)
            }}
          >
            BIBLIOTECA
          </button>
        </div>
        <div className="topbar-user">
          <span>{profile.displayName}</span>
          <small>Biblioteca local</small>
        </div>
      </nav>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}

      <main className="content">
        {selectedGame ? (
          <GameDetailView
            game={selectedGame}
            onBack={() => setSelectedGameId(null)}
            onEdit={setEditGame}
            onToggleShowcase={toggleShowcase}
          />
        ) : tab === 'perfil' ? (
          <ProfileView
            profile={profile}
            stats={stats}
            games={games}
            onOpenGame={openGame}
            onUpdateProfile={updateProfile}
          />
        ) : (
          <LibraryView games={games} onAdd={() => setAddOpen(true)} onOpen={openGame} />
        )}
      </main>

      {addOpen && <AddGameModal onAdd={createGame} onClose={() => setAddOpen(false)} />}
      {editGame && (
        <GameFormModal
          game={editGame}
          onSave={updateGame}
          onDelete={deleteGame}
          onClose={() => setEditGame(null)}
        />
      )}
    </div>
  )
}

export default App
