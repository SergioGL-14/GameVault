import type { Game } from '../../../library/model'
import { STATUS_LABELS } from './status-labels'

interface GameCardProps {
  game: Game
  onOpen: (game: Game) => void
}

export default function GameCard({ game, onOpen }: GameCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="cover-card"
      data-game-id={game.id}
      onClick={() => onOpen(game)}
    >
      <div className="cover-art">
        <span className="cover-letter">{game.title.charAt(0).toUpperCase()}</span>
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              if (game.backgroundUrl && event.currentTarget.src !== game.backgroundUrl) {
                event.currentTarget.src = game.backgroundUrl
              } else {
                event.currentTarget.style.display = 'none'
              }
            }}
          />
        ) : null}
        <span className="cover-title">{game.title}</span>
      </div>
      <span className={`cover-status status-${game.status}`}>
        <span className="status-dot" />
        {STATUS_LABELS[game.status]}
        {game.status === 'completado' && <strong>100%</strong>}
      </span>
    </button>
  )
}
