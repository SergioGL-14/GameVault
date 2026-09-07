import { useEffect, useState, type FormEvent } from 'react'
import type { CatalogResult } from '../../../catalog/model'
import type { Game, Profile } from '../../../library/model'
import type {
  SteamConnectionStatus,
  SteamMetadataRefresh,
  SteamRefreshPreview
} from '../../../steam/model'
import { catalogFailureMessage } from '../catalog/catalog-failure'
import Modal from '../dialog/Modal'
import { formatError } from '../format'

interface SettingsViewProps {
  profile: Profile
  onUpdateProfile: (profile: Profile) => Promise<void>
  onLibraryUpdated: (games: Game[]) => Promise<void>
  onRefreshSteamMetadata: () => Promise<CatalogResult<SteamMetadataRefresh>>
  onSteamConnectionChanged: () => void
  steamMetadataResult: SteamMetadataRefresh | null
  onAchievementsUpdated: () => Promise<void>
}

const disconnected: SteamConnectionStatus = {
  configured: false,
  credentialSource: null,
  account: null
}

/** Edits local profile settings and owns explicit external-account refresh flows. */
export default function SettingsView({
  profile,
  onUpdateProfile,
  onLibraryUpdated,
  onRefreshSteamMetadata,
  onSteamConnectionChanged,
  steamMetadataResult,
  onAchievementsUpdated
}: SettingsViewProps): React.JSX.Element {
  const [general, setGeneral] = useState(profile)
  const [steam, setSteam] = useState<SteamConnectionStatus>(disconnected)
  const [profileInput, setProfileInput] = useState('')
  const [key, setKey] = useState('')
  const [preview, setPreview] = useState<SteamRefreshPreview | null>(null)
  const [resolutions, setResolutions] = useState<Record<number, number | null>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    window.api
      .getSteamConnection()
      .then((status) => {
        if (active) setSteam(status)
      })
      .catch((reason: unknown) => {
        if (active) setMessage(formatError(reason))
      })
    return () => {
      active = false
    }
  }, [])

  async function saveProfile(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await onUpdateProfile(general)
      setMessage('Perfil guardado.')
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function selectImage(field: 'avatarUrl' | 'backgroundUrl'): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const image = await window.api.selectLocalImage()
      if (image !== null) setGeneral((current) => ({ ...current, [field]: image }))
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function connectWeb(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.api.connectSteamWeb()
      if (result.ok) {
        onSteamConnectionChanged()
        setSteam(result.value)
        setMessage('Cuenta de Steam conectada. La biblioteca todavía no se ha refrescado.')
      } else setMessage(catalogFailureMessage(result.error))
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function connectWithApiKey(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.api.connectSteamApiKey(profileInput, key)
      setKey('')
      if (result.ok) {
        onSteamConnectionChanged()
        setSteam(result.value)
        setProfileInput('')
        setMessage('Cuenta de Steam conectada. La biblioteca todavía no se ha refrescado.')
      } else setMessage(catalogFailureMessage(result.error))
    } catch (reason) {
      setKey('')
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function startRefresh(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.api.previewSteamRefresh()
      if (!result.ok) {
        setMessage(catalogFailureMessage(result.error))
        return
      }
      setPreview(result.value)
      setResolutions({})
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function applyRefresh(): Promise<void> {
    if (!preview) return
    setBusy(true)
    setMessage('Guardando el listado de juegos de Steam...')
    try {
      const confirmationResolutions = preview.items
        .filter((item) => item.kind === 'confirmation')
        .map((item) => {
          const gameId = resolutions[item.game.appId]
          if (gameId === undefined) throw new Error('Resuelve todas las coincidencias de Steam')
          return { appId: item.game.appId, gameId }
        })
      const result = await window.api.applySteamRefresh({
        previewId: preview.previewId,
        resolutions: confirmationResolutions
      })
      if (result.ok) {
        setPreview(null)
        await onLibraryUpdated(result.value.games)
        setSteam(await window.api.getSteamConnection())
        setMessage(`${result.value.games.length} juegos guardados. Completando metadatos...`)
        await completeMetadata()
      } else setMessage(catalogFailureMessage(result.error))
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  function metadataMessage(result: SteamMetadataRefresh): string {
    const incomplete = result.failures.length + result.pending
    if (!incomplete)
      return `${result.metadataUpdated} fichas revisadas. Todos los metadatos están al día.`
    const reason = result.failures[0] ? ` ${catalogFailureMessage(result.failures[0].error)}` : ''
    return `${result.metadataUpdated} fichas actualizadas. ${incomplete} pendientes.${reason}`
  }

  async function completeMetadata(): Promise<void> {
    const result = await onRefreshSteamMetadata()
    if (!result.ok) {
      setMessage(catalogFailureMessage(result.error))
      return
    }
    setMessage(null)
  }

  async function disconnectSteam(): Promise<void> {
    setBusy(true)
    try {
      setSteam(await window.api.disconnectSteam())
      onSteamConnectionChanged()
      setMessage('Cuenta desconectada. Los juegos importados se conservan.')
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function refreshAchievements(): Promise<void> {
    setBusy(true)
    setMessage('Importando logros de Steam. Puede tardar varios minutos...')
    try {
      const result = await window.api.refreshSteamAchievements()
      if (result.ok) {
        await onAchievementsUpdated()
        setMessage(
          `${result.value.gamesUpdated} ${result.value.gamesUpdated === 1 ? 'juego' : 'juegos'} con logros revisados.` +
            (result.value.failures.length || result.value.pending
              ? ` ${result.value.failures.length + result.value.pending} juegos quedaron pendientes.` +
                (result.value.failures[0]
                  ? ` ${catalogFailureMessage(result.value.failures[0].error)}`
                  : '')
              : '')
        )
      } else setMessage(catalogFailureMessage(result.error))
    } catch (reason) {
      setMessage(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  function resolutionValue(appId: number): string | number {
    const gameId = resolutions[appId]
    return gameId === undefined ? '' : gameId === null ? 'new' : gameId
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="library-heading">
        <div>
          <p className="eyebrow">GameVault local</p>
          <h1 id="settings-title" data-view-heading tabIndex={-1}>
            Configuración
          </h1>
        </div>
      </header>

      {message && (
        <p className="settings-message" role="alert">
          {message}
        </p>
      )}
      {!message && steamMetadataResult && (
        <p className="settings-message" role="status">
          {metadataMessage(steamMetadataResult)}
        </p>
      )}

      <div className="settings-grid">
        <form className="settings-panel" onSubmit={saveProfile} aria-busy={busy}>
          <h2>General</h2>
          <label className="field">
            <span>Nombre del perfil</span>
            <input
              value={general.displayName}
              onChange={(event) => setGeneral({ ...general, displayName: event.target.value })}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Ubicación</span>
            <input
              value={general.location}
              onChange={(event) => setGeneral({ ...general, location: event.target.value })}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Sobre mí</span>
            <textarea
              rows={4}
              value={general.about}
              onChange={(event) => setGeneral({ ...general, about: event.target.value })}
              disabled={busy}
            />
          </label>
          {(['avatarUrl', 'backgroundUrl'] as const).map((field) => (
            <div className="image-field" key={field}>
              <label className="field">
                <span>{field === 'avatarUrl' ? 'URL del avatar' : 'URL del fondo'}</span>
                <input
                  type="url"
                  value={general[field] ?? ''}
                  onChange={(event) =>
                    setGeneral({ ...general, [field]: event.target.value || null })
                  }
                  disabled={busy}
                />
              </label>
              <div className="image-actions">
                <button
                  type="button"
                  className="quiet-button"
                  aria-label={
                    field === 'avatarUrl'
                      ? 'Elegir archivo para el avatar'
                      : 'Elegir archivo para el fondo'
                  }
                  onClick={() => void selectImage(field)}
                  disabled={busy}
                >
                  Elegir archivo
                </button>
                <button
                  type="button"
                  className="text-button"
                  aria-label={field === 'avatarUrl' ? 'Quitar avatar' : 'Quitar fondo del perfil'}
                  onClick={() => setGeneral({ ...general, [field]: null })}
                  disabled={busy || !general[field]}
                >
                  Quitar imagen
                </button>
              </div>
            </div>
          ))}
          <button className="action-button" disabled={busy}>
            Guardar perfil
          </button>
        </form>

        <section className="settings-panel" aria-labelledby="connections-title">
          <p className="eyebrow">Primera integración</p>
          <h2 id="connections-title">Steam</h2>
          {steam.configured && steam.account ? (
            <div className="connection-card">
              {steam.account.avatarUrl && (
                <img
                  className="connection-avatar"
                  src={steam.account.avatarUrl}
                  alt={`Avatar de ${steam.account.personaName} en Steam`}
                />
              )}
              <strong>{steam.account.personaName}</strong>
              <span>SteamID {steam.account.steamId}</span>
              <small>
                {steam.credentialSource === 'web-session' ? 'Sesión web' : 'API key personal'}
              </small>
              <small>
                {steam.account.lastRefreshedAt
                  ? `Último refresco: ${steam.account.lastRefreshedAt}`
                  : 'Biblioteca aún no refrescada'}
              </small>
              <button
                type="button"
                className="action-button"
                onClick={() => void startRefresh()}
                disabled={busy}
              >
                Refrescar ahora
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => void refreshAchievements()}
                disabled={busy || !steam.account.lastRefreshedAt}
              >
                Importar logros
              </button>
              {steam.credentialSource === 'web-session' && (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void connectWeb()}
                  disabled={busy}
                >
                  Renovar sesión de Steam
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => void disconnectSteam()}
                disabled={busy}
              >
                Desconectar Steam
              </button>
            </div>
          ) : (
            <div className="steam-connect" aria-busy={busy}>
              <p>
                Inicia sesión en la ventana oficial de Steam. GameVault no recibe tu contraseña:
                conserva una sesión aislada en este dispositivo y solo importa tu identidad, juegos
                y propiedad.
              </p>
              <button
                type="button"
                className="action-button steam-login-button"
                onClick={() => void connectWeb()}
                disabled={busy}
              >
                Iniciar sesión con Steam
              </button>
              <small>
                La sesión y los datos importados permanecen en tu equipo. Puedes desconectarla y
                borrarla cuando quieras.
              </small>

              <details className="integration-advanced">
                <summary>Usar API key (avanzado)</summary>
                <form onSubmit={connectWithApiKey}>
                  <p>
                    Método de respaldo para una biblioteca pública. La clave se cifra con el sistema
                    operativo y nunca se guarda en SQLite.
                  </p>
                  <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
                    Obtener una Web API key de Steam ↗
                  </a>
                  <label className="field">
                    <span>SteamID64 o URL del perfil</span>
                    <input
                      value={profileInput}
                      onChange={(event) => setProfileInput(event.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="field">
                    <span>Web API key</span>
                    <input
                      type="password"
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                  <button className="quiet-button" disabled={busy}>
                    Conectar con API key
                  </button>
                </form>
              </details>
            </div>
          )}
        </section>
      </div>

      {preview && (
        <Modal
          className="edit-modal"
          labelledBy="steam-preview-title"
          onClose={() => setPreview(null)}
          busy={busy}
        >
          <header className="modal-header">
            <div>
              <p className="eyebrow">Steam</p>
              <h2 id="steam-preview-title">Confirmar refresco</h2>
            </div>
          </header>
          <p>{preview.items.length} juegos visibles. Todos se asociarán o crearán.</p>
          {busy && (
            <p role="status">
              Guardando el listado de Steam. Mantén GameVault abierto hasta terminar.
            </p>
          )}
          {preview.items.length === 0 && (
            <p role="alert">
              Steam devolvió una biblioteca vacía. Aplicar el refresco marcará como inactivas las
              propiedades Steam anteriores, sin borrar sus fichas.
            </p>
          )}
          <div className="steam-preview-list">
            {preview.items.map((item) => (
              <div key={item.game.appId}>
                <strong>{item.game.title}</strong>
                {item.kind === 'existing' && <span>Asociado con {item.canonicalTitle}</span>}
                {item.kind === 'new' && <span>Se creará una ficha nueva</span>}
                {item.kind === 'confirmation' && (
                  <label>
                    <span>Asociar con</span>
                    <select
                      aria-label={`Asociar ${item.game.title} con`}
                      value={resolutionValue(item.game.appId)}
                      onChange={(event) =>
                        setResolutions({
                          ...resolutions,
                          [item.game.appId]:
                            event.target.value === 'new' ? null : Number(event.target.value)
                        })
                      }
                    >
                      <option value="" disabled>
                        Selecciona una opción
                      </option>
                      <option value="new">Crear ficha nueva</option>
                      {item.candidates.map((candidate) => (
                        <option key={candidate.gameId} value={candidate.gameId}>
                          {candidate.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
          <footer className="modal-footer">
            <button
              type="button"
              className="quiet-button"
              onClick={() => setPreview(null)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="action-button"
              onClick={() => void applyRefresh()}
              disabled={
                busy ||
                preview.items.some(
                  (item) =>
                    item.kind === 'confirmation' && resolutions[item.game.appId] === undefined
                )
              }
            >
              Aplicar refresco
            </button>
          </footer>
        </Modal>
      )}
    </section>
  )
}
