import { useEffect, useState, type FormEvent } from 'react'
import type {
  CatalogFailure,
  CatalogProvider,
  CatalogSearchResult,
  CatalogStatus
} from '../../../catalog/model'
import type { Game, GameInput } from '../../../library/model'
import Modal from '../dialog/Modal'
import { formatError, releaseYear } from '../format'
import { catalogGameToInput } from '../library/game-input'
import { catalogFailureMessage } from './catalog-failure'

interface AddGameModalProps {
  onAdd: (input: GameInput) => Promise<Game>
  onClose: () => void
}

type Mode = CatalogProvider | 'manual'

export default function AddGameModal({ onAdd, onClose }: AddGameModalProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('steam')
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>({
    configured: false,
    source: null
  })
  const [apiKey, setApiKey] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [title, setTitle] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogFailure, setCatalogFailure] = useState<CatalogFailure | null>(null)
  const [replacingKey, setReplacingKey] = useState(false)

  useEffect(() => {
    let active = true
    window.api
      .getCatalogStatus()
      .then((status) => {
        if (active) setCatalogStatus(status)
      })
      .catch((reason: unknown) => {
        if (active) setError(formatError(reason))
      })
    return () => {
      active = false
    }
  }, [])

  async function saveKey(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setCatalogFailure(null)
    try {
      const result = await window.api.saveCatalogKey(apiKey)
      if (!result.ok) {
        setCatalogFailure(result.error)
        return
      }
      setCatalogStatus(result.value)
      setApiKey('')
      setReplacingKey(false)
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function search(event: FormEvent): Promise<void> {
    event.preventDefault()
    await performSearch()
  }

  async function performSearch(): Promise<void> {
    if (mode === 'manual') return
    setBusy(true)
    setError(null)
    setCatalogFailure(null)
    setResults([])
    setSearched(false)
    try {
      const result = await window.api.searchCatalog(mode, query)
      if (!result.ok) {
        setCatalogFailure(result.error)
        return
      }
      setResults(result.value)
      setSearched(true)
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function importGame(result: CatalogSearchResult): Promise<void> {
    setBusy(true)
    setImporting(true)
    setError(null)
    setCatalogFailure(null)
    try {
      const detail = await window.api.getCatalogGame(result.source, result.catalogId)
      if (!detail.ok) {
        setCatalogFailure(detail.error)
        setBusy(false)
        setImporting(false)
        return
      }
      await onAdd(catalogGameToInput(detail.value))
    } catch (reason) {
      setError(formatError(reason))
      setBusy(false)
      setImporting(false)
    }
  }

  async function addManual(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onAdd({
        source: 'manual',
        title,
        description,
        coverUrl: coverUrl || null,
        status: 'pendiente'
      })
    } catch (reason) {
      setError(formatError(reason))
      setBusy(false)
    }
  }

  async function clearKey(): Promise<void> {
    setError(null)
    setCatalogFailure(null)
    try {
      setCatalogStatus(await window.api.clearCatalogKey())
      setReplacingKey(false)
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  function selectMode(nextMode: Mode): void {
    setMode(nextMode)
    setResults([])
    setSearched(false)
    setError(null)
    setCatalogFailure(null)
    setReplacingKey(false)
  }

  function requestClose(): void {
    if (!busy) onClose()
  }

  const failureMessage =
    catalogFailure?.kind === 'authentication' && catalogFailure.provider === 'rawg'
      ? catalogStatus.source === 'environment'
        ? 'RAWG rechazó RAWG_API_KEY. Actualiza o elimina esa variable de entorno y reinicia GameVault.'
        : catalogStatus.source === null
          ? 'RAWG rechazó la clave introducida. Revísala o prueba con otra.'
          : catalogFailureMessage(catalogFailure)
      : catalogFailure
        ? catalogFailureMessage(catalogFailure)
        : null

  return (
    <Modal
      className="add-modal"
      labelledBy="add-game-modal-title"
      onClose={requestClose}
      busy={busy}
    >
      <header className="modal-header">
        <div>
          <p className="eyebrow">Nueva incorporación</p>
          <h2 id="add-game-modal-title">Añadir a la biblioteca</h2>
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

      <div className="modal-tabs" role="group" aria-label="Fuente del juego">
        <button
          type="button"
          className={mode === 'steam' ? 'active' : ''}
          aria-pressed={mode === 'steam'}
          onClick={() => selectMode('steam')}
          disabled={busy}
        >
          Steam
        </button>
        <button
          type="button"
          className={mode === 'rawg' ? 'active' : ''}
          aria-pressed={mode === 'rawg'}
          onClick={() => selectMode('rawg')}
          disabled={busy}
        >
          RAWG <small>opcional</small>
        </button>
        <button
          type="button"
          className={mode === 'manual' ? 'active' : ''}
          aria-pressed={mode === 'manual'}
          onClick={() => selectMode('manual')}
          disabled={busy}
        >
          Entrada manual
        </button>
      </div>

      {mode === 'rawg' && (!catalogStatus.configured || replacingKey) && (
        <div className="catalog-setup">
          <span className="setup-mark">R</span>
          <div>
            <h3>Conecta el catálogo de RAWG</h3>
            <p>
              Usa tu propia clave gratuita. Se cifra con la protección de credenciales de Windows y
              nunca se expone al navegador de la aplicación.
            </p>
            <a href="https://rawg.io/login?forward=developer" target="_blank" rel="noreferrer">
              Obtener clave gratuita ↗
            </a>
          </div>
          <form onSubmit={saveKey}>
            <label className="field catalog-key-field">
              <span>Clave API de RAWG</span>
              <input
                autoFocus={replacingKey}
                type="password"
                placeholder="Pega aquí tu API key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <button type="submit" className="action-button" disabled={busy}>
              Guardar y conectar
            </button>
          </form>
        </div>
      )}

      {(mode === 'steam' || (mode === 'rawg' && catalogStatus.configured && !replacingKey)) && (
        <>
          <form className="catalog-search" onSubmit={search}>
            <label className="visually-hidden" htmlFor="catalog-search">
              Buscar en {mode === 'steam' ? 'Steam' : 'RAWG'}
            </label>
            <input
              id="catalog-search"
              autoFocus
              type="search"
              placeholder={
                mode === 'steam'
                  ? "Busca primero en Steam: Hollow Knight, Baldur's Gate…"
                  : 'Busca juegos fuera de Steam en RAWG…'
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={busy}
              minLength={2}
              required
            />
            <button type="submit" className="action-button" disabled={busy}>
              {busy ? (importing ? 'Importando…' : 'Buscando…') : 'Buscar'}
            </button>
          </form>
          <div className="catalog-results" aria-busy={busy}>
            {results.map((result) => (
              <button
                type="button"
                className="catalog-result"
                key={result.catalogId}
                onClick={() => importGame(result)}
                disabled={busy}
              >
                <div className="result-art">
                  {result.coverUrl ? <img src={result.coverUrl} alt="" /> : <span>GV</span>}
                </div>
                <div>
                  <strong>{result.title}</strong>
                  <span>
                    {releaseYear(result.releasedAt)} ·{' '}
                    {result.platforms.slice(0, 3).join(', ') || 'Sin plataforma'}
                  </span>
                </div>
                {result.metacritic != null && <em>{result.metacritic}</em>}
                <b>＋</b>
              </button>
            ))}
            {!results.length && !catalogFailure && (
              <p className="catalog-placeholder">
                {searched
                  ? 'No se encontraron resultados. Prueba con otro título o usa una entrada manual.'
                  : mode === 'steam'
                    ? 'Steam es el catálogo principal y no requiere configuración. Busca un título para importar su ficha.'
                    : 'Usa RAWG cuando un juego no esté en Steam. Tu progreso seguirá guardándose solo en este equipo.'}
              </p>
            )}
          </div>
          <p className="visually-hidden" role="status" aria-live="polite">
            {busy
              ? importing
                ? 'Importando juego'
                : `Buscando en ${mode === 'steam' ? 'Steam' : 'RAWG'}`
              : searched
                ? `${results.length} resultados encontrados`
                : ''}
          </p>
          <footer className="catalog-footer">
            <a
              href={mode === 'steam' ? 'https://store.steampowered.com/' : 'https://rawg.io/'}
              target="_blank"
              rel="noreferrer"
            >
              Datos e imágenes: {mode === 'steam' ? 'Steam' : 'RAWG'} ↗
            </a>
            {mode === 'rawg' && catalogStatus.source === 'saved' && (
              <button type="button" className="text-button" onClick={clearKey} disabled={busy}>
                Eliminar clave
              </button>
            )}
          </footer>
        </>
      )}

      {mode === 'manual' && (
        <form className="manual-form" onSubmit={addManual}>
          <label className="field">
            <span>Título</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className="field">
            <span>URL de carátula (opcional)</span>
            <input
              type="url"
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="field">
            <span>Descripción (opcional)</span>
            <textarea
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="modal-footer">
            <span className="spacer" />
            <button type="button" className="quiet-button" onClick={requestClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="action-button" disabled={busy}>
              Crear ficha
            </button>
          </div>
        </form>
      )}

      {catalogFailure && (
        <div className="catalog-failure" role="alert">
          <strong>No se pudo completar la operación</strong>
          <p>{failureMessage}</p>
          <small>Tu biblioteca local sigue disponible.</small>
          <div>
            {mode !== 'manual' &&
              !replacingKey &&
              query.trim().length >= 2 &&
              (mode === 'steam' || catalogStatus.configured) && (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void performSearch()}
                  disabled={busy}
                >
                  Reintentar búsqueda
                </button>
              )}
            {catalogFailure.kind === 'authentication' &&
              catalogFailure.provider === 'rawg' &&
              catalogStatus.source === 'saved' && (
                <>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => setReplacingKey(true)}
                  >
                    Sustituir clave
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={clearKey}
                    disabled={busy}
                  >
                    Eliminar clave
                  </button>
                </>
              )}
          </div>
        </div>
      )}
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
