import { useDeferredValue, useState } from 'react'
import { GAME_STATUSES, STATUS_LABELS, type Game, type GameStatus } from '../../../shared/types'
import GameCard from './GameCard'

interface LibraryViewProps {
  games: Game[]
  onAdd: () => void
  onOpen: (game: Game) => void
}

type Filter = 'todos' | GameStatus

export default function LibraryView({ games, onAdd, onOpen }: LibraryViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('es'))
  const visible = games.filter(
    (game) =>
      (filter === 'todos' || game.status === filter) &&
      (!deferredQuery || game.title.toLocaleLowerCase('es').includes(deferredQuery))
  )

  return (
    <section className="library-page">
      <header className="library-heading">
        <div>
          <p className="eyebrow">Colección personal</p>
          <h1>Biblioteca</h1>
          <p>{games.length} títulos guardados en este equipo</p>
        </div>
        <button type="button" className="action-button" onClick={onAdd}>
          <span>＋</span> Añadir juego
        </button>
      </header>

      <div className="library-controls">
        <label className="search-box">
          <span aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Buscar en la biblioteca"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="library-filters" aria-label="Filtrar biblioteca">
          {(['todos', ...GAME_STATUSES] as Filter[]).map((value) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {value === 'todos' ? 'Todos' : STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <span className="result-count">{visible.length} resultados</span>
      </div>

      {visible.length ? (
        <div className="cover-wall">
          {visible.map((game) => (
            <GameCard key={game.id} game={game} onOpen={onOpen} />
          ))}
          <button type="button" className="add-cover" onClick={onAdd}>
            <span>＋</span>
            Añadir título
          </button>
        </div>
      ) : (
        <div className="library-empty">
          <span>＋</span>
          <h2>{games.length ? 'No hay coincidencias' : 'Empieza tu colección'}</h2>
          <p>
            {games.length
              ? 'Prueba otra búsqueda o cambia el filtro.'
              : 'Busca un juego en RAWG o crea una ficha manual.'}
          </p>
          {!games.length && (
            <button type="button" className="action-button" onClick={onAdd}>
              Añadir primer juego
            </button>
          )}
        </div>
      )}
      <div className="view-credits">
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
    </section>
  )
}
