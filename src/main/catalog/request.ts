import { CatalogError, type CatalogProvider } from '../../catalog/model'

type FetchLike = typeof fetch

/** Fetches and parses provider JSON while hiding transport and HTTP details behind catalog failures. */
export async function requestCatalogJson(
  provider: CatalogProvider,
  url: string | URL,
  fetcher: FetchLike,
  usesAuthentication = false
): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(10_000) })
  } catch (cause) {
    const kind = cause instanceof Error && cause.name === 'TimeoutError' ? 'timeout' : 'offline'
    throw new CatalogError({ provider, kind }, { cause })
  }

  if (usesAuthentication && (response.status === 401 || response.status === 403)) {
    throw new CatalogError({ provider, kind: 'authentication' })
  }
  if (response.status === 429) throw new CatalogError({ provider, kind: 'rate-limit' })
  if (!response.ok) throw new CatalogError({ provider, kind: 'provider-response' })

  try {
    return await response.json()
  } catch (cause) {
    throw new CatalogError({ provider, kind: 'provider-response' }, { cause })
  }
}
