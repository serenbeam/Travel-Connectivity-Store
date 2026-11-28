import { describe, expect, it } from 'vitest';

import {
  MAX_ERROR_LENGTH,
  N8N_MAX_ATTEMPTS,
  N8N_TIMEOUT_MS,
  createN8nClient,
  sanitizeErrorForOutbox,
} from '@/modules/automation/n8n.client';
import type { WirePayload } from '@/modules/automation/payload';

/**
 * n8n webhook client (ADR-9, AC-T14, FR-N2).
 *
 * `fetch` is injected so these tests never touch the network or read process environment.
 * They pin the retry policy: one retry for transient failures only, never for 4xx.
 */
const payload: WirePayload = {
  event: 'order.paid',
  notificationId: '0f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
  orderNumber: 'RML-4KQ9ZT',
  customerName: 'Budi Santoso',
  customerEmail: 'budi@example.com',
  destinationName: 'Japan',
  packageName: 'Japan 5 GB · 15 days',
  packageDataSnapshot: '5 GB · 15 hari',
  totalIdr: 145000,
  paidAt: '2026-11-28T05:56:03.123Z',
};

const CONFIG = { url: 'https://n8n.test/webhook/roamly-order-paid', secret: 's'.repeat(32) };

interface Recorded {
  url: string;
  init: RequestInit;
}

function fakeFetch(handler: (call: number, recorded: Recorded) => Promise<Response>) {
  const calls: Recorded[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const recorded = { url: String(input), init: init ?? {} };
    calls.push(recorded);

    return handler(calls.length, recorded);
  }) as typeof fetch;

  return { impl, calls };
}

function client(fetchImpl: typeof fetch) {
  return createN8nClient({ fetchImpl, resolveConfig: () => CONFIG });
}

describe('timing constants', () => {
  it('uses a 10 s timeout and two attempts total', () => {
    expect(N8N_TIMEOUT_MS).toBe(10_000);
    expect(N8N_MAX_ATTEMPTS).toBe(2);
  });
});

describe('success', () => {
  it('treats 2xx as accepted on the first attempt', async () => {
    const f = fakeFetch(async () => new Response('{"accepted":true}', { status: 200 }));

    const result = await client(f.impl).send(payload);

    expect(result).toMatchObject({ ok: true, attempts: 1, httpStatus: 200 });
    expect(f.calls).toHaveLength(1);
  });

  it('sends the secret header, JSON body, and the order.paid event', async () => {
    const f = fakeFetch(async () => new Response('{}', { status: 200 }));

    await client(f.impl).send(payload);

    const [call] = f.calls;
    expect(call?.url).toBe(CONFIG.url);
    expect(call?.init.method).toBe('POST');

    const headers = call?.init.headers as Record<string, string>;
    expect(headers['x-webhook-secret']).toBe(CONFIG.secret);
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse(String(call?.init.body)) as WirePayload;
    expect(body.event).toBe('order.paid');
    expect(body.notificationId).toBe(payload.notificationId);
  });
});

describe('transient failures retry exactly once', () => {
  it('succeeds on the retry after a 5xx', async () => {
    const f = fakeFetch(async (call) =>
      call === 1 ? new Response('boom', { status: 503 }) : new Response('{}', { status: 200 }),
    );

    const result = await client(f.impl).send(payload);

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(f.calls).toHaveLength(2);
  });

  it('reports http_5xx after both attempts fail', async () => {
    const f = fakeFetch(async () => new Response('boom', { status: 502 }));

    const result = await client(f.impl).send(payload);

    expect(result).toMatchObject({
      ok: false,
      attempts: 2,
      reason: 'http_5xx',
      httpStatus: 502,
      error: 'n8n_http_502',
    });
    expect(f.calls).toHaveLength(2);
  });

  it('retries a network error once', async () => {
    const f = fakeFetch(async () => {
      throw new TypeError('fetch failed');
    });

    const result = await client(f.impl).send(payload);

    expect(result).toMatchObject({ ok: false, attempts: 2, reason: 'network', error: 'n8n_network' });
    expect(f.calls).toHaveLength(2);
  });

  it('retries a timeout once and reports n8n_timeout', async () => {
    const f = fakeFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });

    const result = await client(f.impl).send(payload);

    expect(result).toMatchObject({ ok: false, attempts: 2, reason: 'timeout', error: 'n8n_timeout' });
    expect(f.calls).toHaveLength(2);
  });
});

describe('permanent failures do not retry', () => {
  it('stops at the first 4xx', async () => {
    const f = fakeFetch(async () => new Response('{"message":"unauthorized"}', { status: 401 }));

    const result = await client(f.impl).send(payload);

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      reason: 'http_4xx',
      httpStatus: 401,
      error: 'n8n_http_401',
    });
    expect(f.calls).toHaveLength(1);
  });

  it('reports a missing configuration without calling the network', async () => {
    const f = fakeFetch(async () => new Response('{}', { status: 200 }));
    const unconfigured = createN8nClient({
      fetchImpl: f.impl,
      resolveConfig: () => {
        throw new Error('missing env');
      },
    });

    const result = await unconfigured.send(payload);

    expect(result).toMatchObject({ ok: false, attempts: 0, reason: 'misconfigured' });
    expect(f.calls).toHaveLength(0);
  });
});

describe('sanitizeErrorForOutbox', () => {
  it('keeps a short readable token', () => {
    expect(sanitizeErrorForOutbox('n8n_http_503')).toBe('n8n_http_503');
  });

  it('strips quotes, newlines, slashes, and URLs', () => {
    const cleaned = sanitizeErrorForOutbox(
      'failed: https://n8n.internal/webhook?secret=abc\n"stack" \\o/',
    );

    expect(cleaned).not.toMatch(/[\n"\\/]/);
    expect(cleaned.startsWith('failed')).toBe(true);
  });

  it('bounds the length and never returns an empty string', () => {
    expect(sanitizeErrorForOutbox('x'.repeat(500))).toHaveLength(MAX_ERROR_LENGTH);
    expect(sanitizeErrorForOutbox('   ')).toBe('unknown_error');
  });
});
