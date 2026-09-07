import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogResult } from '../../catalog/model'
import type {
  Achievement,
  AchievementInput,
  Game,
  GameInput,
  LibraryStats,
  Profile,
  ProfileInput
} from '../../library/model'
import type { SteamMetadataRefresh } from '../../steam/model'
import AddGameModal from './catalog/AddGameModal'
import { formatError } from './format'
import GameDetailView from './library/GameDetailView'
import GameFormModal from './library/GameFormModal'
import LibraryView from './library/LibraryView'
import { gameToInput } from './library/game-input'
import ProfileView from './profile/ProfileView'
import SettingsView from './settings/SettingsView'

type Tab = 'perfil' | 'biblioteca' | 'ajustes'

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
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [stats, setStats] = useState<LibraryStats>({
    totalGames: 0,
    completed: 0,
    playing: 0,
    totalPlaytimeMinutes: 0,
    totalAchievements: 0,
    unlockedAchievements: 0
  })
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const selectedGameIdRef = useRef<number | null>(null)
  const achievementRevisionRef = useRef(0)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(false)
  const [achievementsLoaded, setAchievementsLoaded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editGame, setEditGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [steamMetadataResult, setSteamMetadataResult] = useState<SteamMetadataRefresh | null>(null)
  const contentRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const returnGameIdRef = useRef<number | null>(null)
  const focusTargetRef = useRef<'heading' | 'return' | null>(null)
  const metadataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const metadataRefreshRef = useRef<Promise<CatalogResult<SteamMetadataRefresh>> | null>(null)
  const metadataCooldownResultRef = useRef<CatalogResult<SteamMetadataRefresh> | null>(null)
  const metadataRunnerRef = useRef<(() => Promise<CatalogResult<SteamMetadataRefresh>>) | null>(
    null
  )
  const metadataRefreshQueuedRef = useRef(false)
  const metadataGenerationRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextGames, nextProfile, nextStats] = await fetchAll()
      setGames(nextGames)
      setProfile(nextProfile)
      setProfileLoaded(true)
      setStats(nextStats)
      setError(null)
    } catch (reason) {
      setError(formatError(reason))
    }
  }, [])

  const refreshSteamMetadata = useCallback((): Promise<CatalogResult<SteamMetadataRefresh>> => {
    if (metadataTimerRef.current && metadataCooldownResultRef.current) {
      return Promise.resolve(metadataCooldownResultRef.current)
    }
    if (metadataRefreshRef.current) {
      metadataRefreshQueuedRef.current = true
      return metadataRefreshRef.current
    }
    const generation = metadataGenerationRef.current
    const request = window.api.refreshSteamMetadata().then((result) => {
      if (generation !== metadataGenerationRef.current) return result
      if (!result.ok) return result
      setGames(result.value.games)
      setEditGame((current) =>
        current ? (result.value.games.find((game) => game.id === current.id) ?? current) : null
      )
      setSteamMetadataResult(result.value)
      const rateLimit = result.value.failures.find(
        ({ error: failure }) => failure.kind === 'rate-limit'
      )?.error
      if (metadataTimerRef.current) clearTimeout(metadataTimerRef.current)
      metadataTimerRef.current = null
      metadataCooldownResultRef.current = null
      if (rateLimit) {
        metadataCooldownResultRef.current = result
        const delay = Math.max(1, rateLimit.retryAfterSeconds ?? 30) * 1_000
        metadataTimerRef.current = setTimeout(() => {
          metadataTimerRef.current = null
          metadataCooldownResultRef.current = null
          metadataRefreshQueuedRef.current = false
          void metadataRunnerRef.current?.()
        }, delay)
      }
      return result
    })
    metadataRefreshRef.current = request
    const clearRequest = (): void => {
      if (metadataRefreshRef.current === request) metadataRefreshRef.current = null
      if (metadataRefreshQueuedRef.current && !metadataTimerRef.current) {
        metadataRefreshQueuedRef.current = false
        void metadataRunnerRef.current?.()
      }
    }
    void request.then(clearRequest, clearRequest)
    return request
  }, [])

  const resetSteamMetadata = useCallback((): void => {
    metadataGenerationRef.current += 1
    metadataRefreshQueuedRef.current = false
    metadataCooldownResultRef.current = null
    if (metadataTimerRef.current) clearTimeout(metadataTimerRef.current)
    metadataTimerRef.current = null
    setSteamMetadataResult(null)
  }, [])

  useEffect(() => {
    metadataRunnerRef.current = refreshSteamMetadata
    return () => {
      metadataRunnerRef.current = null
    }
  }, [refreshSteamMetadata])

  useEffect(() => {
    let active = true
    fetchAll()
      .then(([nextGames, nextProfile, nextStats]) => {
        if (!active) return
        setGames(nextGames)
        setProfile(nextProfile)
        setProfileLoaded(true)
        setStats(nextStats)
        document.title = 'GameVault'
      })
      .catch((reason: unknown) => {
        if (active) setError(formatError(reason))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    window.api
      .getSteamConnection()
      .then((connection) => {
        if (active && connection.account?.lastRefreshedAt) void refreshSteamMetadata()
      })
      .catch((reason: unknown) => {
        if (active) setError(formatError(reason))
      })
    return () => {
      active = false
      if (metadataTimerRef.current) clearTimeout(metadataTimerRef.current)
    }
  }, [refreshSteamMetadata])

  useEffect(() => {
    let active = true
    if (selectedGameId === null) return
    const revision = achievementRevisionRef.current
    window.api
      .listAchievements(selectedGameId)
      .then((nextAchievements) => {
        if (active && revision === achievementRevisionRef.current) {
          setAchievements(nextAchievements)
          setAchievementsLoading(false)
          setAchievementsLoaded(true)
        }
      })
      .catch((reason: unknown) => {
        if (active && revision === achievementRevisionRef.current) {
          setAchievementsLoading(false)
          setError(formatError(reason))
        }
      })
    return () => {
      active = false
    }
  }, [selectedGameId])

  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null

  useEffect(() => {
    const focusTarget = focusTargetRef.current
    if (!focusTarget) return
    if (focusTarget === 'return' && returnFocusRef.current?.isConnected) {
      focusTargetRef.current = null
      returnFocusRef.current.focus()
      return
    }
    if (focusTarget === 'return' && returnGameIdRef.current !== null) {
      const card = contentRef.current?.querySelector<HTMLElement>(
        `[data-game-id="${returnGameIdRef.current}"]`
      )
      if (card) {
        focusTargetRef.current = null
        card.focus()
        return
      }
    }
    const heading = contentRef.current?.querySelector<HTMLElement>('[data-view-heading]')
    if (heading) {
      focusTargetRef.current = null
      heading.focus()
    }
  }, [profileLoaded, selectedGame?.id, tab])

  function clearGameSelection(): void {
    achievementRevisionRef.current += 1
    selectedGameIdRef.current = null
    setSelectedGameId(null)
    setAchievements([])
    setAchievementsLoading(false)
    setAchievementsLoaded(false)
  }

  function showTab(nextTab: Tab): void {
    focusTargetRef.current = 'heading'
    returnFocusRef.current = null
    returnGameIdRef.current = null
    setTab(nextTab)
    clearGameSelection()
  }

  function openGame(game: Game): void {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    returnGameIdRef.current = game.id
    focusTargetRef.current = 'heading'
    setTab('biblioteca')
    setAchievements([])
    setAchievementsLoading(true)
    setAchievementsLoaded(false)
    achievementRevisionRef.current += 1
    selectedGameIdRef.current = game.id
    setSelectedGameId(game.id)
  }

  function closeGame(): void {
    focusTargetRef.current = 'return'
    clearGameSelection()
  }

  function storeGame(game: Game): void {
    setGames((current) =>
      [...current.filter((entry) => entry.id !== game.id), game].sort((first, second) =>
        first.title.localeCompare(second.title, 'es')
      )
    )
  }

  async function createGame(input: GameInput): Promise<Game> {
    const result = await window.api.createGame(input)
    const created = result.game
    storeGame(created)
    setNotice(
      result.created
        ? null
        : `“${created.title}” ya estaba en tu biblioteca. Se completaron los metadatos disponibles.`
    )
    setAddOpen(false)
    focusTargetRef.current = 'heading'
    returnFocusRef.current = null
    returnGameIdRef.current = null
    setAchievements([])
    setAchievementsLoading(true)
    setAchievementsLoaded(false)
    achievementRevisionRef.current += 1
    selectedGameIdRef.current = created.id
    setSelectedGameId(created.id)
    await refresh()
    return created
  }

  async function refreshGameMetadata(game: Game): Promise<CatalogResult<Game>> {
    const result = await window.api.refreshGameMetadata(game.id)
    if (result.ok) {
      storeGame(result.value)
      setEditGame(result.value)
    }
    return result
  }

  async function updateGame(game: Game, input: GameInput): Promise<void> {
    storeGame(await window.api.updateGame(game.id, input))
    setEditGame(null)
    await refresh()
  }

  async function deleteGame(game: Game): Promise<void> {
    if (!window.confirm(`¿Eliminar "${game.title}" de tu biblioteca?`)) return
    await window.api.deleteGame(game.id)
    setGames((current) => current.filter((entry) => entry.id !== game.id))
    setEditGame(null)
    focusTargetRef.current = 'heading'
    returnFocusRef.current = null
    returnGameIdRef.current = null
    clearGameSelection()
    await refresh()
  }

  async function refreshAchievementStats(): Promise<void> {
    try {
      setStats(await window.api.getStats())
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  async function acceptSteamLibrary(nextGames: Game[]): Promise<void> {
    setGames(nextGames)
    try {
      setStats(await window.api.getStats())
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  async function createAchievement(gameId: number, input: AchievementInput): Promise<void> {
    const created = await window.api.createAchievement(gameId, input)
    if (selectedGameIdRef.current === gameId) {
      achievementRevisionRef.current += 1
      setAchievements((current) =>
        [...current, created].sort((first, second) => first.name.localeCompare(second.name, 'es'))
      )
    }
    await refreshAchievementStats()
  }

  async function updateAchievement(
    achievement: Achievement,
    input: AchievementInput
  ): Promise<void> {
    const updated = await window.api.updateAchievement(achievement.id, input)
    if (selectedGameIdRef.current === achievement.gameId) {
      achievementRevisionRef.current += 1
      setAchievements((current) =>
        current
          .map((entry) => (entry.id === updated.id ? updated : entry))
          .sort((first, second) => first.name.localeCompare(second.name, 'es'))
      )
    }
    await refreshAchievementStats()
  }

  async function clearAchievementOverride(achievement: Achievement): Promise<void> {
    const updated = await window.api.clearAchievementOverride(achievement.id)
    if (selectedGameIdRef.current === achievement.gameId) {
      achievementRevisionRef.current += 1
      setAchievements((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      )
    }
    await refreshAchievementStats()
  }

  async function deleteAchievement(achievement: Achievement): Promise<void> {
    if (!window.confirm(`¿Eliminar el logro "${achievement.name}"?`)) return
    await window.api.deleteAchievement(achievement.id)
    if (selectedGameIdRef.current === achievement.gameId) {
      achievementRevisionRef.current += 1
      setAchievements((current) => current.filter((entry) => entry.id !== achievement.id))
    }
    await refreshAchievementStats()
  }

  async function toggleShowcase(game: Game): Promise<void> {
    try {
      storeGame(
        await window.api.updateGame(game.id, {
          ...gameToInput(game),
          showcased: !game.showcased
        })
      )
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
      <nav className="topbar" aria-label="Navegación principal">
        <button
          type="button"
          className="profile-nav"
          onClick={() => showTab('perfil')}
          aria-label="Ir al perfil"
          aria-current={tab === 'perfil' && !selectedGame ? 'page' : undefined}
        >
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            <span className="profile-nav-fallback" aria-hidden="true">
              {profile.displayName.trim().charAt(0).toUpperCase() || 'G'}
            </span>
          )}
          <span>{profile.displayName}</span>
        </button>
        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === 'biblioteca' ? 'active' : ''}`}
            onClick={() => showTab('biblioteca')}
            aria-current={tab === 'biblioteca' ? 'page' : undefined}
          >
            BIBLIOTECA
          </button>
        </div>
        <button
          type="button"
          className={`settings-nav ${tab === 'ajustes' ? 'active' : ''}`}
          onClick={() => showTab('ajustes')}
          aria-label="Abrir configuración"
          aria-current={tab === 'ajustes' ? 'page' : undefined}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25ZM20.25 13.35V10.65L17.9 10A6.5 6.5 0 0 0 17.2 8.3L18.4 6.2 16.5 4.3 14.4 5.5A6.5 6.5 0 0 0 12.7 4.8L12.05 2.5H9.35L8.7 4.8A6.5 6.5 0 0 0 7 5.5L4.9 4.3 3 6.2 4.2 8.3A6.5 6.5 0 0 0 3.5 10L1.15 10.65V13.35L3.5 14A6.5 6.5 0 0 0 4.2 15.7L3 17.8 4.9 19.7 7 18.5A6.5 6.5 0 0 0 8.7 19.2L9.35 21.5H12.05L12.7 19.2A6.5 6.5 0 0 0 14.4 18.5L16.5 19.7 18.4 17.8 17.2 15.7A6.5 6.5 0 0 0 17.9 14Z" />
          </svg>
        </button>
      </nav>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="status-banner" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      )}

      <main className="content" ref={contentRef}>
        {selectedGame ? (
          <GameDetailView
            game={selectedGame}
            achievements={achievements}
            achievementsLoading={achievementsLoading}
            achievementsLoaded={achievementsLoaded}
            onBack={closeGame}
            onEdit={setEditGame}
            onToggleShowcase={toggleShowcase}
            onCreateAchievement={createAchievement}
            onUpdateAchievement={updateAchievement}
            onClearAchievementOverride={clearAchievementOverride}
            onDeleteAchievement={deleteAchievement}
          />
        ) : tab === 'perfil' ? (
          <ProfileView profile={profile} stats={stats} games={games} onOpenGame={openGame} />
        ) : tab === 'biblioteca' ? (
          <LibraryView games={games} onAdd={() => setAddOpen(true)} onOpen={openGame} />
        ) : profileLoaded ? (
          <SettingsView
            profile={profile}
            onUpdateProfile={updateProfile}
            onLibraryUpdated={acceptSteamLibrary}
            onRefreshSteamMetadata={refreshSteamMetadata}
            onSteamConnectionChanged={resetSteamMetadata}
            steamMetadataResult={steamMetadataResult}
            onAchievementsUpdated={refreshAchievementStats}
          />
        ) : (
          <p>Cargando configuración...</p>
        )}
      </main>

      {addOpen && <AddGameModal onAdd={createGame} onClose={() => setAddOpen(false)} />}
      {editGame && (
        <GameFormModal
          game={editGame}
          onSave={updateGame}
          onRefreshMetadata={refreshGameMetadata}
          onDelete={deleteGame}
          onClose={() => setEditGame(null)}
        />
      )}
    </div>
  )
}

export default App
