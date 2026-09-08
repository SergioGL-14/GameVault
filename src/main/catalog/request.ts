import { CatalogError, type CatalogProvider } from '../../catalog/model'

type FetchLike = typeof fetch

/** Converts either supported Retry-After form into a non-negative delay. */
export function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isSafeInteger(seconds) && seconds >= 0) return seconds
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, Math.ceil((date - Date.now()) / 1000))
}

/** Fetches and parses provider JSON while hiding transport and HTTP details behind catalog failures. */
export async function requestCatalogJson(
  provider: CatalogProvider,
  url: string | URL,
  fetcher: FetchLike,
  usesAuthentication = false,
  init: RequestInit = {}
): Promise<unknown> {
  let response: Response
  try {
    const timeout = AbortSignal.timeout(10_000)
    response = await fetcher(url, {
      ...init,
      redirect: usesAuthentication ? 'error' : init.redirect,
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    })
  } catch (cause) {
    if (init.signal?.aborted) throw cause
    const kind = cause instanceof Error && cause.name === 'TimeoutError' ? 'timeout' : 'offline'
    throw new CatalogError({ provider, kind }, { cause })
  }

  if (usesAuthentication && (response.status === 401 || response.status === 403)) {
    throw new CatalogError({ provider, kind: 'authentication' })
  }
  if (response.status === 429) {
    throw new CatalogError({
      provider,
      kind: 'rate-limit',
      retryAfterSeconds: retryAfterSeconds(response.headers.get('retry-after'))
    })
  }
  if (!response.ok) throw new CatalogError({ provider, kind: 'provider-response' })

  try {
    return await response.json()
  } catch (cause) {
    throw new CatalogError({ provider, kind: 'provider-response' }, { cause })
  }
}
