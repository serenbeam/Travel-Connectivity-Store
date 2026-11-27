import { describe, expect, it } from 'vitest';

import { at, rows } from '../support/psql';

/**
 * NV-03a — effective privileges, including PUBLIC and inherited grants.
 *
 * Target (docs/database-design.md §4): only `service_role` may execute the five
 * transactional RPCs, only `authenticated` may execute `is_admin()`, trigger functions
 * are executable by nobody, and no object carries a PUBLIC grant.
 */

const RPCs = [
  'public.create_order_idempotent(text,text,jsonb)',
  'public.settle_payment(text,text)',
  'public.claim_outbox(uuid)',
  'public.finish_outbox(uuid,timestamptz,boolean,text)',
  'public.record_mock_settlement(text,text)',
] as const;

const TRIGGER_FUNCTIONS = [
  'public.set_updated_at()',
  'public.orders_before_update()',
  'public.payments_before_update()',
  'public.enforce_payment_amount()',
  'public.assert_order_payment_consistency()',
  'public.assert_outbox_matches_paid()',
  'public.guard_outbox_order_is_paid()',
] as const;

type Access = { anon: boolean; authenticated: boolean; serviceRole: boolean; owner: boolean };

function effectiveAccess(): Map<string, Access> {
  const sql = `
    with roles(role_name) as (values ('anon'),('authenticated'),('service_role'),('postgres')),
    fns(signature) as (values ${[
      ...RPCs,
      ...TRIGGER_FUNCTIONS,
      'public.is_admin()',
    ]
      .map((signature) => `('${signature}')`)
      .join(',')})
    select f.signature,
      max(case when r.role_name='anon' then case when has_function_privilege(r.role_name,f.signature,'EXECUTE') then '1' else '0' end else '' end),
      max(case when r.role_name='authenticated' then case when has_function_privilege(r.role_name,f.signature,'EXECUTE') then '1' else '0' end else '' end),
      max(case when r.role_name='service_role' then case when has_function_privilege(r.role_name,f.signature,'EXECUTE') then '1' else '0' end else '' end),
      max(case when r.role_name='postgres' then case when has_function_privilege(r.role_name,f.signature,'EXECUTE') then '1' else '0' end else '' end)
    from fns f cross join roles r group by f.signature order by f.signature;`;

  const result = new Map<string, Access>();

  for (const row of rows(sql)) {
    result.set(at(row, 0), {
      anon: at(row, 1) === '1',
      authenticated: at(row, 2) === '1',
      serviceRole: at(row, 3) === '1',
      owner: at(row, 4) === '1',
    });
  }

  return result;
}

describe('privileges — effective EXECUTE matrix', () => {
  it('grants the five RPCs to service_role only', () => {
    const access = effectiveAccess();

    for (const signature of RPCs) {
      expect(access.get(signature), `${signature} must exist`).toBeDefined();
      expect(access.get(signature), signature).toEqual({
        anon: false,
        authenticated: false,
        serviceRole: true,
        owner: true, // postgres owns the tables and the functions
      });
    }
  });

  it('grants is_admin() to authenticated only (still an INVOKER function)', () => {
    const access = effectiveAccess();

    expect(access.get('public.is_admin()')).toEqual({
      anon: false,
      authenticated: true,
      serviceRole: false,
      owner: true,
    });

    const [row] = rows(
      `select prosecdef::text from pg_proc where oid = 'public.is_admin()'::regprocedure;`,
    );
    expect(at(row, 0)).toBe('false');
  });

  it('grants the trigger functions to nobody', () => {
    const access = effectiveAccess();

    for (const signature of TRIGGER_FUNCTIONS) {
      expect(access.get(signature), signature).toEqual({
        anon: false,
        authenticated: false,
        serviceRole: false,
        owner: true,
      });
    }
  });

  it('carries no PUBLIC grantee on any function in the public schema', () => {
    const grantees = rows(`
      select p.oid::regprocedure::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(p.proacl) a
       where n.nspname = 'public' and a.grantee = 0;`);

    expect(grantees).toEqual([]);
  });

  it('does not auto-expose new functions created by the migration role', () => {
    // Migrations run as `postgres`, so only that role's default ACL governs the objects
    // in these files. (`supabase_admin` has auto-exposed defaults, which is why the
    // explicit REVOKEs in migration 0006 matter: an object created through Studio would
    // otherwise start life executable by anon/authenticated.)
    const leaked = rows(`
      select d.defaclacl::text
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
       where n.nspname = 'public' and d.defaclobjtype = 'f'
         and pg_get_userbyid(d.defaclrole) = 'postgres'
         and d.defaclacl::text ~ '(anon|authenticated)=';`);

    expect(leaked).toEqual([]);
  });
});

describe('privileges — table matrix and RLS', () => {
  it('matches the documented grant matrix for all seven tables', () => {
    const sql = `
      select c.relname,
        max(case when r.role_name='anon' then concat(
          case when has_table_privilege(r.role_name,c.oid,'SELECT') then 'S' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'INSERT') then 'I' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'UPDATE') then 'U' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'DELETE') then 'D' else '-' end) end),
        max(case when r.role_name='authenticated' then concat(
          case when has_table_privilege(r.role_name,c.oid,'SELECT') then 'S' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'INSERT') then 'I' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'UPDATE') then 'U' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'DELETE') then 'D' else '-' end) end),
        max(case when r.role_name='service_role' then concat(
          case when has_table_privilege(r.role_name,c.oid,'SELECT') then 'S' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'INSERT') then 'I' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'UPDATE') then 'U' else '-' end,
          case when has_table_privilege(r.role_name,c.oid,'DELETE') then 'D' else '-' end) end)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'),('authenticated'),('service_role')) r(role_name)
      where n.nspname = 'public' and c.relkind = 'r'
      group by c.relname order by c.relname;`;

    const actual = Object.fromEntries(
      rows(sql).map(([table, anon, authenticated, serviceRole]) => [
        table,
        { anon, authenticated, serviceRole },
      ]),
    );

    expect(actual).toEqual({
      destinations: { anon: 'S---', authenticated: 'SIUD', serviceRole: '----' },
      idempotency_keys: { anon: '----', authenticated: '----', serviceRole: '----' },
      mock_gateway_transactions: { anon: '----', authenticated: '----', serviceRole: 'S---' },
      notification_outbox: { anon: '----', authenticated: 'S---', serviceRole: 'S---' },
      orders: { anon: '----', authenticated: 'S---', serviceRole: 'S---' },
      packages: { anon: 'S---', authenticated: 'SIUD', serviceRole: '----' },
      payments: { anon: '----', authenticated: 'S---', serviceRole: 'S---' },
    });
  });

  it('enables RLS on all seven tables', () => {
    const disabled = rows(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`);

    expect(disabled).toEqual([]);
  });

  it('has exactly the seven documented policies', () => {
    const policies = rows(`
      select tablename || ':' || policyname
        from pg_policies where schemaname = 'public' order by 1;`).map(([name]) => name);

    expect(policies).toEqual([
      'destinations:dest_admin_all',
      'destinations:dest_public_read',
      'notification_outbox:outbox_admin_read',
      'orders:orders_admin_read',
      'packages:pkg_admin_all',
      'packages:pkg_public_read',
      'payments:payments_admin_read',
    ]);
  });
});
