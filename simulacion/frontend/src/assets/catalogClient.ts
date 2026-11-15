import { type AssetCatalog } from './catalogSchema';
import { parseAssetCatalog } from './parseCatalog';
import { ASSET_LIBRARY_BASE } from './library';

export type CatalogResult =
  | { readonly status: 'ready'; readonly catalog: AssetCatalog }
  | { readonly status: 'not-generated' }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'unreachable'; readonly message: string };

export async function fetchCatalog(
  signal: AbortSignal,
  fetchFn: typeof fetch = fetch,
  base: string = ASSET_LIBRARY_BASE,
): Promise<CatalogResult> {
  let response: Response;
  try {
    response = await fetchFn(`${base}catalog.json`, { signal, cache: 'no-store' });
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      status: 'unreachable',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (response.status === 404) return { status: 'not-generated' };
  if (!response.ok) return { status: 'unreachable', message: `HTTP ${response.status}` };
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { status: 'invalid', message: 'catalog.json no es JSON válido' };
  }
  try {
    return { status: 'ready', catalog: parseAssetCatalog(json) };
  } catch (error) {
    return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
  }
}
