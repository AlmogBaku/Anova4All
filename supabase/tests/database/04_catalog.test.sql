-- Catalog guards: every policy and public function reachable by authenticated/anon
-- must require private.is_browser_session() (plan check 9).
begin;
\ir _helpers.psql
select * from no_plan();

select is_empty($$
  select format('%s.%s policy %L', p.schemaname, p.tablename, p.policyname)
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.roles && array['authenticated', 'anon', 'public']::name[]
    and not (
      (p.qual is null or p.qual like '%private.is_browser_session()%')
      and (p.with_check is null or p.with_check like '%private.is_browser_session()%')
      and coalesce(p.qual, p.with_check) is not null
    )
$$, 'every public policy for authenticated/anon/public requires private.is_browser_session()');

select is_empty($$
  select p.oid::regprocedure::text
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
         or pg_catalog.has_function_privilege('anon', p.oid, 'execute'))
    and p.prosrc not like '%private.is_browser_session()%'
$$, 'every public function executable by authenticated/anon checks private.is_browser_session()');

select is_empty($$
  select p.oid::regprocedure::text
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
$$, 'anon can execute no function in public or private');

select is_empty($$
  select p.oid::regprocedure::text
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'every security definer function sets an empty search_path');

select is_empty($$
  select c.relname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'RLS is enabled on every public table');

select is_empty($$
  select table_name || ':' || privilege_type
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema in ('public', 'private')
$$, 'anon has no table grants');
select is_empty($$
  select table_name || '.' || column_name || ':' || privilege_type
  from information_schema.column_privileges
  where grantee = 'anon' and table_schema in ('public', 'private')
$$, 'anon has no column grants');

select is_empty($$
  select table_name || '.' || column_name || ':' || privilege_type
  from information_schema.column_privileges
  where grantee = 'authenticated' and table_schema = 'public'
    and column_name in ('key_hash', 'token_hash')
$$, 'authenticated has no privilege on key_hash or token_hash');

select results_eq($$
  select table_name::text collate "default", column_name::text collate "default"
  from information_schema.column_privileges
  where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'UPDATE'
  order by 1, 2
$$, $$ values ('devices', 'name') $$, 'the only column authenticated can update is devices.name');

select is_empty($$
  select table_name || ':' || privilege_type
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and privilege_type in ('INSERT', 'UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
$$, 'authenticated has no table-wide insert/update/truncate grants');

select ok(not exists (select 1 from pg_catalog.pg_namespace n where n.nspname = 'private'
                       and pg_catalog.has_schema_privilege('anon', n.oid, 'usage')),
  'anon has no usage on schema private');

-- Every FK has an index whose leading columns match.
select is_empty($$
  select c.conrelid::regclass::text || ' ' || c.conname
  from pg_catalog.pg_constraint c
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_catalog.pg_index i
      where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
    )
$$, 'every foreign key has a covering index');

select * from finish();
rollback;
