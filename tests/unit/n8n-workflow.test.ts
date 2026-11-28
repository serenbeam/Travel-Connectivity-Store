import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the n8n workflow artifact (MT1-F1).
 *
 * The workflow is data, not application code, so this test executes the real
 * `Validate & compose` JavaScript from `n8n/order-paid-email.json` inside a `node:vm`
 * sandbox with a mocked `$input`. Checking the source text alone would not have caught
 * MT1-F1 (the node read n8n's Webhook wrapper instead of its `body`).
 *
 * No n8n instance, network, or credential is involved.
 */
interface WorkflowNode {
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id?: string }>;
  continueOnFail?: boolean;
  onError?: unknown;
}

interface Workflow {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
  active: boolean;
}

const workflow = JSON.parse(
  readFileSync(new URL('../../n8n/order-paid-email.json', import.meta.url), 'utf8'),
) as Workflow;

const NOTIFICATION_ID = '0f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

const payload = {
  event: 'order.paid',
  notificationId: NOTIFICATION_ID,
  orderNumber: 'RML-4KQ9ZT',
  customerName: 'Budi Santoso',
  customerEmail: 'budi@example.com',
  destinationName: 'Japan',
  packageName: 'Japan 5 GB · 15 days',
  packageDataSnapshot: '5 GB · 15 hari',
  totalIdr: 145000,
  paidAt: '2026-11-28T05:56:03.123Z',
};

function codeNode(): WorkflowNode {
  const node = workflow.nodes.find((candidate) => candidate.name === 'Validate & compose');

  if (!node) {
    throw new Error('Validate & compose node is missing from the workflow artifact');
  }

  return node;
}

/** Executes the Code node exactly as n8n would, returning its output items. */
function runCodeNode(inputItem: unknown): Array<{ json: Record<string, unknown> }> {
  const source = String(codeNode().parameters.jsCode);

  // Wrapped in a function because the node body uses a top-level `return`.
  const execute = vm.runInNewContext(`(function ($input) {\n${source}\n})`, {}) as (
    input: { first: () => { json: unknown } },
  ) => Array<{ json: Record<string, unknown> }>;

  return execute({ first: () => ({ json: inputItem }) });
}

/** Exactly what n8n's Webhook node hands to the next node. */
function webhookWrapper(body: unknown) {
  return {
    headers: { 'content-type': 'application/json', 'x-webhook-secret': 'redacted' },
    params: {},
    query: {},
    body,
  };
}

function paidHtml(items: Array<{ json: Record<string, unknown> }>): string {
  return String(items[0]?.json.html ?? '');
}

describe('Validate & compose — accepted input shapes', () => {
  it('accepts a direct payload (no wrapper)', () => {
    const items = runCodeNode(payload);

    expect(items).toHaveLength(1);
    expect(items[0]?.json).toMatchObject({
      notificationId: NOTIFICATION_ID,
      orderNumber: 'RML-4KQ9ZT',
      to: 'budi@example.com',
      subject: 'Roamly order RML-4KQ9ZT confirmed',
    });
    expect(paidHtml(items)).toContain('Rp 145.000');
    expect(paidHtml(items)).toContain('WIB');
    expect(paidHtml(items)).toContain(`Reference: ${NOTIFICATION_ID}`);
  });

  it('accepts the n8n Webhook wrapper { headers, params, query, body } (MT1-F1)', () => {
    const items = runCodeNode(webhookWrapper(payload));

    expect(items).toHaveLength(1);
    expect(items[0]?.json).toMatchObject({
      notificationId: NOTIFICATION_ID,
      to: 'budi@example.com',
      subject: 'Roamly order RML-4KQ9ZT confirmed',
    });
    expect(paidHtml(items)).toContain('Rp 145.000');
    expect(paidHtml(items)).toContain(`Reference: ${NOTIFICATION_ID}`);
  });

  it('renders the paid timestamp as WIB (UTC+7), including a day rollover', () => {
    // 17:30 UTC on 28 Nov is 00:30 WIB on 29 Nov.
    const items = runCodeNode(webhookWrapper({ ...payload, paidAt: '2026-11-28T17:30:00.000Z' }));

    expect(paidHtml(items)).toContain('29 Nov 2026, 00:30 WIB');
  });

  it('escapes HTML in customer-supplied values', () => {
    const items = runCodeNode(
      webhookWrapper({ ...payload, customerName: '<script>alert(1)</script>' }),
    );
    const html = paidHtml(items);

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('Validate & compose — rejected input', () => {
  it('rejects an event other than order.paid', () => {
    expect(() => runCodeNode(webhookWrapper({ ...payload, event: 'order.pending' }))).toThrow(
      /invalid_event/,
    );
  });

  it('rejects a missing required field', () => {
    const { customerEmail, ...withoutEmail } = payload;
    void customerEmail;

    expect(() => runCodeNode(webhookWrapper(withoutEmail))).toThrow(
      /invalid_payload: missing customerEmail/,
    );
  });

  it('rejects a non-canonical paidAt (offset instead of Z)', () => {
    expect(() =>
      runCodeNode(webhookWrapper({ ...payload, paidAt: '2026-11-28T05:56:03.123+00:00' })),
    ).toThrow(/invalid_payload: paidAt/);
  });

  it('rejects a non-integer total', () => {
    expect(() => runCodeNode(webhookWrapper({ ...payload, totalIdr: 12.5 }))).toThrow(
      /invalid_payload: totalIdr/,
    );
  });
});

describe('workflow structure', () => {
  it('keeps one inactive workflow with the five expected nodes', () => {
    expect(workflow.active).toBe(false);
    expect(workflow.nodes.map((node) => node.name)).toEqual([
      'Setup notes',
      'Webhook',
      'Validate & compose',
      'Send Email',
      'Respond 200',
    ]);
  });

  it('keeps the webhook on POST /webhook with header auth answering through Respond', () => {
    const webhook = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');

    expect(webhook?.parameters).toMatchObject({
      httpMethod: 'POST',
      path: 'roamly-order-paid',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
    });
  });

  it('sends the email only after validation and responds only after the email node', () => {
    expect(workflow.connections.Webhook?.main[0]?.[0]?.node).toBe('Validate & compose');
    expect(workflow.connections['Validate & compose']?.main[0]?.[0]?.node).toBe('Send Email');
    expect(workflow.connections['Send Email']?.main[0]?.[0]?.node).toBe('Respond 200');
  });

  it('never swallows a failure (no continueOnFail, no onError override)', () => {
    for (const node of workflow.nodes) {
      expect(node.continueOnFail).not.toBe(true);
      expect(node.onError).toBeUndefined();
    }
  });

  it('ships no credential material in the artifact', () => {
    expect(workflow.nodes.filter((node) => node.credentials).length).toBe(0);
  });
});
