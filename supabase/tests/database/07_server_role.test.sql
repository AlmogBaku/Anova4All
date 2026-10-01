-- anova_server: what the Go server needs, and nothing in auth.
begin;
\ir _helpers.psql
select * from no_plan();

select ok((select rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole
           from pg_roles where rolname = 'anova_server'), 'anova_server is a plain login noinherit role');
select is((select rolpassword from pg_authid where rolname = 'anova_server'), null, 'anova_server has no password');
select ok(not has_schema_privilege('anova_server', 'auth', 'usage'), 'anova_server has no usage on schema auth');
select ok(not has_table_privilege('anova_server', 'auth.users', 'select'), 'anova_server cannot read auth.users');
select ok(not has_schema_privilege('anova_server', 'private', 'usage'), 'anova_server has no usage on schema private');
select ok(not has_function_privilege('anova_server', 'public.unpair_device(uuid)', 'execute'), 'anova_server cannot call browser RPCs');

-- postgres needs SET on the role to impersonate it in this test.
grant anova_server to postgres;
-- pgTAP lives in schema extensions; let the role call it inside this test only.
grant usage on schema extensions to anova_server;
set local role anova_server;

select results_eq($$ select extensions.crypt('testkey000', key_hash) = key_hash from public.devices $$,
  $$ values (true) $$, 'anova_server reads key_hash (bcrypt matches testkey000)');
select results_eq($$ select extensions.crypt('testkey111', key_hash) = key_hash from public.devices $$,
  $$ values (false) $$, 'a wrong key does not match');

select lives_ok($$
  insert into public.devices (id, id_card, key_hash, owner_id)
  values ('d0000000-0000-4000-8000-000000000002', 'anova f00000000000000000000001',
          extensions.crypt('testkey111', extensions.gen_salt('bf')),
          (select owner_id from public.devices where id = 'd0000000-0000-4000-8000-000000000001'))
$$, 'anova_server inserts devices');
select lives_ok($$ update public.devices set last_seen_at = now(), key_hash = key_hash where id = 'd0000000-0000-4000-8000-000000000002' $$,
  'anova_server updates devices');
select lives_ok($$
  insert into public.device_members (device_id, user_id)
  select 'd0000000-0000-4000-8000-000000000002', user_id from public.device_members
$$, 'anova_server inserts members');
select results_eq($$ select count(*)::int from public.device_members $$, $$ values (2) $$, 'anova_server reads members');
select lives_ok($$ delete from public.device_members where device_id = 'd0000000-0000-4000-8000-000000000002' $$, 'anova_server deletes members');

select lives_ok($$ update public.cooks set ended_at = now(), end_reason = 'manual' where ended_at is null $$, 'anova_server closes cooks');
select lives_ok($$ insert into public.cooks (device_id, auto_stop) values ('d0000000-0000-4000-8000-000000000002', true) $$, 'anova_server inserts cooks');
select results_eq($$ select count(*)::int from public.cooks $$, $$ values (2) $$, 'anova_server reads cooks');
select throws_ok($$ delete from public.cooks $$, '42501', null, 'anova_server cannot delete cooks');

select throws_ok($$ select token_hash from public.device_invites $$, '42501', null, 'anova_server cannot read token_hash');
select throws_ok($$ insert into public.device_invites (device_id, token_hash, created_by) values ('d0000000-0000-4000-8000-000000000002', '\x00', gen_random_uuid()) $$,
  '42501', null, 'anova_server cannot create invites');
select lives_ok($$ delete from public.device_invites where device_id = 'd0000000-0000-4000-8000-000000000002' $$, 'anova_server deletes invites');

select lives_ok($$ delete from public.devices where id = 'd0000000-0000-4000-8000-000000000002' $$, 'anova_server deletes devices');
select results_eq($$ select count(*)::int from public.cooks $$, $$ values (1) $$, 'deleting a device cascades to its cooks');

reset role;
select * from finish();
rollback;
