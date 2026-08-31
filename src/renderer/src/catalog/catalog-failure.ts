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
        : 'El catálogo rechazó la solicitud. Vuelve a intentarlo más tarde.'
    case 'rate-limit':
      return `${provider} ha limitado temporalmente las solicitudes. Inténtalo de nuevo más tarde.`
    case 'provider-response':
      return `${provider} devolvió una respuesta que GameVault no pudo interpretar.`
  }
}
