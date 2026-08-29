import { useEffect, useState, type FormEvent } from 'react'
import type {
  CatalogProvider,
  CatalogSearchResult,
  CatalogStatus,
  Game,
  GameInput
} from '../../../shared/types'
import { catalogGameToInput } from '../lib/game'
import { formatError, releaseYear } from '../lib/format'

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
  const [title, setTitle] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    try {
      setCatalogStatus(await window.api.saveCatalogKey(apiKey))
      setApiKey('')
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function search(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (mode === 'manual') return
    setBusy(true)
    setError(null)
    try {
      setResults(await window.api.searchCatalog(mode, query))
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function importGame(result: CatalogSearchResult): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const detail = await window.api.getCatalogGame(result.source, result.catalogId)
      await onAdd(catalogGameToInput(detail))
    } catch (reason) {
      setError(formatError(reason))
      setBusy(false)
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
    try {
      setCatalogStatus(await window.api.clearCatalogKey())
    } catch (reason) {
      setError(formatError(reason))
    }
  }

  function selectMode(nextMode: Mode): void {
    setMode(nextMode)
    setResults([])
    setError(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="add-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">Nueva incorporación</p>
            <h2>Añadir a la biblioteca</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="modal-tabs">
          <button
            type="button"
            className={mode === 'steam' ? 'active' : ''}
            onClick={() => selectMode('steam')}
          >
            Steam
          </button>
          <button
            type="button"
            className={mode === 'rawg' ? 'active' : ''}
            onClick={() => selectMode('rawg')}
          >
            RAWG <small>opcional</small>
          </button>
          <button
            type="button"
            className={mode === 'manual' ? 'active' : ''}
            onClick={() => selectMode('manual')}
          >
            Entrada manual
          </button>
        </div>

        {mode === 'rawg' && !catalogStatus.configured && (
          <div className="catalog-setup">
            <span className="setup-mark">R</span>
            <div>
              <h3>Conecta el catálogo de RAWG</h3>
              <p>
                Usa tu propia clave gratuita. Se cifra con la protección de credenciales de Windows
                y nunca se expone al navegador de la aplicación.
              </p>
              <a href="https://rawg.io/login?forward=developer" target="_blank" rel="noreferrer">
                Obtener clave gratuita ↗
              </a>
            </div>
            <form onSubmit={saveKey}>
              <input
                type="password"
                placeholder="Pega aquí tu API key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                required
              />
              <button type="submit" className="action-button" disabled={busy}>
                Guardar y conectar
              </button>
            </form>
          </div>
        )}

        {(mode === 'steam' || (mode === 'rawg' && catalogStatus.configured)) && (
          <>
            <form className="catalog-search" onSubmit={search}>
              <input
                autoFocus
                type="search"
                placeholder={
                  mode === 'steam'
                    ? "Busca primero en Steam: Hollow Knight, Baldur's Gate…"
                    : 'Busca juegos fuera de Steam en RAWG…'
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                minLength={2}
                required
              />
              <button type="submit" className="action-button" disabled={busy}>
                {busy ? 'Buscando…' : 'Buscar'}
              </button>
            </form>
            <div className="catalog-results">
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
              {!results.length && (
                <p className="catalog-placeholder">
                  {mode === 'steam'
                    ? 'Steam es el catálogo principal y no requiere configuración. Busca un título para importar su ficha.'
                    : 'Usa RAWG cuando un juego no esté en Steam. Tu progreso seguirá guardándose solo en este equipo.'}
                </p>
              )}
            </div>
            <footer className="catalog-footer">
              <a
                href={mode === 'steam' ? 'https://store.steampowered.com/' : 'https://rawg.io/'}
                target="_blank"
                rel="noreferrer"
              >
                Datos e imágenes: {mode === 'steam' ? 'Steam' : 'RAWG'} ↗
              </a>
              {mode === 'rawg' && catalogStatus.source === 'saved' && (
                <button type="button" className="text-button" onClick={clearKey}>
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
              <button type="button" className="quiet-button" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="action-button" disabled={busy}>
                Crear ficha
              </button>
            </div>
          </form>
        )}

        {error && <p className="modal-error">{error}</p>}
      </section>
    </div>
  )
}
