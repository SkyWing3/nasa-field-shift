import { describe, expect, it, vi } from 'vitest';

import { createSimulationClient } from './client';
import { ApiError, describeApiError } from './errors';

const BASE_URL = 'http://api.test';
const HEALTHY = { status: 'ok', service: 'terralab-api', version: '0.1.0', environment: 'test' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Se esperaba un ApiError');
}

describe('createSimulationClient().getHealth', () => {
  it('devuelve la respuesta validada y llama a /api/health', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(HEALTHY));
    const client = createSimulationClient({ baseUrl: BASE_URL, fetchFn });

    await expect(client.getHealth()).resolves.toEqual(HEALTHY);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/api/health`);
    expect(init?.method).toBe('GET');
  });

  it('clasifica los códigos HTTP de error', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ detail: 'x' }, 503));
    const error = await captureError(
      createSimulationClient({ baseUrl: BASE_URL, fetchFn }).getHealth(),
    );
    expect(error.kind).toBe('http');
    expect(error.status).toBe(503);
    expect(describeApiError(error)).toContain('503');
  });

  it('rechaza respuestas fuera de contrato', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...HEALTHY, status: 'degraded' }));
    const error = await captureError(
      createSimulationClient({ baseUrl: BASE_URL, fetchFn }).getHealth(),
    );
    expect(error.kind).toBe('invalid-response');
  });

  it('rechaza cuerpos que no son JSON', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>', { status: 200 }));
    const error = await captureError(
      createSimulationClient({ baseUrl: BASE_URL, fetchFn }).getHealth(),
    );
    expect(error.kind).toBe('invalid-response');
  });

  it('clasifica los fallos de red', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await captureError(
      createSimulationClient({ baseUrl: BASE_URL, fetchFn }).getHealth(),
    );
    expect(error.kind).toBe('network');
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('agota el tiempo de espera', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const client = createSimulationClient({ baseUrl: BASE_URL, fetchFn, timeoutMs: 20 });
    const error = await captureError(client.getHealth());
    expect(error.kind).toBe('timeout');
  });

  it('distingue la cancelación iniciada por el llamador', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const promise = createSimulationClient({ baseUrl: BASE_URL, fetchFn }).getHealth(
      controller.signal,
    );
    controller.abort();
    const error = await captureError(promise);
    expect(error.kind).toBe('aborted');
  });
});
