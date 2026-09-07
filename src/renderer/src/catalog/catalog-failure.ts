import type { CatalogFailure } from '../../../catalog/model'

/** Converts a provider-neutral failure into actionable Spanish copy for catalog users. */
export function catalogFailureMessage(failure: CatalogFailure): string {
  const provider = failure.provider === 'steam' ? 'Steam' : 'RAWG'
  switch (failure.kind) {
    case 'invalid-input':
      return 'Revisa la búsqueda o la credencial introducida y vuelve a intentarlo.'
    case 'offline':
      return `No se pudo conectar con ${provider}. Comprueba tu conexión y vuelve a intentarlo.`
    case 'timeout':
      return `${provider} está tardando demasiado en responder. Puedes reintentar la operación.`
    case 'authentication':
      return failure.provider === 'rawg'
        ? 'RAWG rechazó la clave configurada. Sustitúyela o elimínala para continuar.'
        : 'La sesión de Steam ha caducado o Steam rechazó la API key. Vuelve a conectar la cuenta.'
    case 'rate-limit':
      return failure.retryAfterSeconds === undefined
        ? `${provider} ha limitado temporalmente las solicitudes. Inténtalo de nuevo más tarde.`
        : `${provider} ha limitado temporalmente las solicitudes. Espera al menos ${failure.retryAfterSeconds < 60 ? `${failure.retryAfterSeconds} segundos` : `${Math.ceil(failure.retryAfterSeconds / 60)} minutos`}.`
    case 'provider-response':
      return `${provider} devolvió una respuesta que GameVault no pudo interpretar.`
    case 'stale-preview':
      return 'La biblioteca cambió o la vista previa caducó. Genera una nueva vista previa.'
    case 'secure-storage':
      return 'GameVault no guardó la clave porque el cifrado seguro del sistema no está disponible.'
  }
}
