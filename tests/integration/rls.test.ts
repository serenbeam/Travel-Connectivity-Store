import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminSession, memberSession } from './support/auth';
import { anonClient, serviceClient } from './support/clients';
import { createPendingOrder } from './support/factories';

/**
 * RLS behaviour for the four roles the design distinguishes.
 *
 * Guest order reads never travel through `anon`: the route handler validates the
 * capability token with the service client and returns an explicit column list
 * (docs/database-design.md §4).
 */
describe('RLS — role matrix', () => {
  let admin: SupabaseClient;
  let member: SupabaseClient;
  const anon = anonClient();
  const service = serviceClient();
  const inactiveSlug = 'rls-probe-hidden';

  beforeAll(async () => {
    admin = await adminSession();
    member = await memberSession();
    await createPendingOrder();
  });

  afterAll(async () => {
    await admin.from('destinations').delete().eq('slug', inactiveSlug);
  });

  describe('anon', () => {
    it('cannot read orders at the privilege layer (42501)', async () => {
      const { data, error } = await anon.from('orders').select('id').limit(1);

      expect(data).toBeNull();
      expect(error?.code).toBe('42501');
    });

    it('cannot read payments, outbox or idempotency keys', async () => {
      for (const table of ['payments', 'notification_outbox', 'idempotency_keys']) {
        const { error } = await anon.from(table).select('id').limit(1);
        expect(error?.code, `${table} must be denied to anon`).toBe('42501');
      }
    });

    it('reads only active catalog rows', async () => {
      const { data, error } = await anon.from('destinations').select('slug');

      expect(error).toBeNull();
      expect(data).toHaveLength(5);
      expect((data ?? []).every((row) => !String(row.slug).startsWith('rls-probe'))).toBe(true);
    });

    it('cannot write catalog rows', async () => {
      const { error } = await anon
        .from('packages')
        .update({ price_idr: 1 })
        .eq('slug', 'japan-3gb-7d');

      expect(error?.code).toBe('42501');
    });
  });

  describe('authenticated non-admin', () => {
    it('sees zero orders because the RLS policy filters every row', async () => {
      const { data, error } = await member.from('orders').select('id');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('sees zero payments and outbox rows', async () => {
      const payments = await member.from('payments').select('id');
      const outbox = await member.from('notification_outbox').select('id');

      expect(payments.error).toBeNull();
      expect(payments.data).toEqual([]);
      expect(outbox.error).toBeNull();
      expect(outbox.data).toEqual([]);
    });

    it('reads the active catalog', async () => {
      const { data, error } = await member.from('packages').select('slug');

      expect(error).toBeNull();
      expect(data).toHaveLength(15);
    });

    it('cannot write catalog rows', async () => {
      // UPDATE is filtered by the USING clause, so a non-admin sees zero rows to
      // update: PostgreSQL reports success with 0 affected rows rather than raising.
      const update = await member
        .from('destinations')
        .update({ name: 'Hijacked' })
        .eq('slug', 'japan')
        .select('slug');

      expect(update.error).toBeNull();
      expect(update.data).toEqual([]);

      // service_role deliberately holds no grant on the catalog, so verify as anon.
      const unchanged = await anon
        .from('destinations')
        .select('name')
        .eq('slug', 'japan')
        .single();
      expect(unchanged.error).toBeNull();
      expect(unchanged.data?.name).toBe('Japan');
    });

    it('cannot insert catalog rows (WITH CHECK violation)', async () => {
      const { error } = await member.from('destinations').insert({
        slug: 'member-probe',
        country_code: 'ZY',
        name: 'Member Probe',
        region: 'Test',
        currency_code: 'ZYY',
        summary: 'Should be rejected.',
        hero_image_url: 'https://example.invalid/probe.jpg',
        hero_image_attribution: 'Test fixture',
      });

      expect(error?.code).toBe('42501');
      expect(error?.message).toContain('row-level security');
    });

    it('cannot read idempotency_keys (no table grant)', async () => {
      const { error } = await member.from('idempotency_keys').select('id').limit(1);

      expect(error?.code).toBe('42501');
    });
  });

  describe('authenticated admin', () => {
    it('reads transactional rows', async () => {
      const { data, error } = await admin.from('orders').select('id').limit(5);

      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('creates, hides, then removes a catalog row', async () => {
      const { error: insertError } = await admin.from('destinations').insert({
        slug: inactiveSlug,
        country_code: 'ZZ',
        name: 'RLS Probe',
        region: 'Test',
        currency_code: 'ZZZ',
        summary: 'Hidden test destination.',
        hero_image_url: 'https://example.invalid/probe.jpg',
        hero_image_attribution: 'Test fixture',
        is_active: false,
      });

      expect(insertError).toBeNull();

      const adminView = await admin.from('destinations').select('slug').eq('slug', inactiveSlug);
      expect(adminView.data).toHaveLength(1);

      const publicView = await anon.from('destinations').select('slug').eq('slug', inactiveSlug);
      expect(publicView.data).toEqual([]);
      expect(publicView.error).toBeNull();
    });

    it('cannot read idempotency_keys (no table grant for any client role)', async () => {
      const { error } = await admin.from('idempotency_keys').select('id').limit(1);

      expect(error?.code).toBe('42501');
    });
  });

  describe('service_role', () => {
    it('bypasses RLS and reads every row', async () => {
      const { data, error } = await service.from('orders').select('id');

      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('has no INSERT/UPDATE/DELETE privilege on the transactional tables', async () => {
      const probeId = randomUUID();
      const mutableColumn: Record<string, string> = {
        orders: 'status',
        payments: 'status',
        idempotency_keys: 'touched_at',
        notification_outbox: 'status',
        mock_gateway_transactions: 'outcome',
      };

      for (const [table, column] of Object.entries(mutableColumn)) {
        const insert = await service.from(table).insert({}).select();
        expect(insert.error?.code, `${table} must reject service_role INSERT`).toBe('42501');

        const update = await service
          .from(table)
          .update({ [column]: column === 'touched_at' ? new Date().toISOString() : 'x' })
          .eq('id', probeId)
          .select('id');
        expect(update.error?.code, `${table} must reject service_role UPDATE`).toBe('42501');

        const remove = await service.from(table).delete().eq('id', probeId).select('id');
        expect(remove.error?.code, `${table} must reject service_role DELETE`).toBe('42501');
      }
    });

    it('has no write privilege on the catalog either', async () => {
      const insert = await service.from('destinations').insert({}).select();
      expect(insert.error?.code).toBe('42501');
    });
  });
});
