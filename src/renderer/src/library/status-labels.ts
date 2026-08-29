import type { GameStatus } from '../../../library/model'

export const STATUS_LABELS: Record<GameStatus, string> = {
  jugando: 'Jugando',
  completado: 'Completado',
  pendiente: 'Pendiente',
  abandonado: 'Abandonado',
  deseado: 'En deseo'
}
