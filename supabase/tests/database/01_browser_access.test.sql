-- Browser-session access through RLS and column grants (plan check 9).
begin;
\ir _helpers.psql
select * from no_plan();

-- eve (not a member) sees nothing ------------------------------------------
select tests.authenticate_as('eve@example.test');
select is_empty($$ select id from public.devices $$, 'eve sees no devices');
select is_empty($$ select device_id from public.device_members $$, 'eve sees no members');
select is_empty($$ select id from public.cooks $$, 'eve sees no cooks');
select is_empty($$ select id from public.device_invites $$, 'eve sees no invites');
select is_empty($$ update public.devices set name = 'Eve' returning id $$, 'eve cannot rename');
select is_empty($$ delete from public.device_members returning user_id $$, 'eve cannot remove members');
select throws_ok($$ select public.unpair_device('d0000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_owner', 'eve cannot unpair');
select throws_ok($$ select public.create_device_invite('d0000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_owner', 'eve cannot invite');
select throws_ok($$ select * from public.list_device_members('d0000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_member', 'eve cannot list members');

-- bob (member) reads but cannot manage --------------------------------------
select tests.authenticate_as('bob@example.test');
select results_eq($$ select id_card from public.devices $$,
  $$ values ('anova f00000000000000000000000'::text) $$, 'bob sees the shared device');
select results_eq($$ select count(*)::int from public.cooks $$, $$ values (1) $$, 'bob sees its cooks');
select results_eq($$ select count(*)::int from public.device_members $$, $$ values (1) $$, 'bob sees the member list');
select is_empty($$ select id from public.device_invites $$, 'bob does not see invites');
select is_empty($$ update public.devices set name = 'Bob' returning id $$, 'bob cannot rename');
select throws_ok($$ select public.unpair_device('d0000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_owner', 'bob cannot unpair');
select throws_ok($$ select public.create_device_invite('d0000000-0000-4000-8000-000000000001') $$,
  '42501', 'not_owner', 'bob cannot invite');
select results_eq(
  $$ select email, is_owner from public.list_device_members('d0000000-0000-4000-8000-000000000001') $$,
  $$ values ('alice@example.test'::text, true), ('bob@example.test'::text, false) $$,
  'bob lists owner and members');

-- nobody reads key_hash or writes anything but name -------------------------
select throws_ok($$ select key_hash from public.devices $$, '42501', null, 'bob cannot read key_hash');
select throws_ok($$ select * from public.devices $$, '42501', null, 'select * is refused (key_hash)');
select tests.authenticate_as('alice@example.test');
select throws_ok($$ select key_hash from public.devices $$, '42501', null, 'owner cannot read key_hash');
select throws_ok($$ select token_hash from public.device_invites $$, '42501', null, 'owner cannot read token_hash');
select throws_ok($$ update public.devices set key_hash = 'x' $$, '42501', null, 'owner cannot update key_hash');
select throws_ok($$ update public.devices set owner_id = tests.user_id('eve@example.test') $$, '42501', null, 'owner cannot update owner_id');
select throws_ok($$ update public.devices set id_card = 'anova f00000000000000000000001' $$, '42501', null, 'owner cannot update id_card');
select throws_ok($$ update public.devices set last_seen_at = now() $$, '42501', null, 'owner cannot update last_seen_at');
select throws_ok($$ insert into public.devices (id_card, key_hash, owner_id) values ('anova f00000000000000000000002', 'x', tests.user_id('alice@example.test')) $$,
  '42501', null, 'owner cannot insert devices');
select throws_ok($$ delete from public.devices $$, '42501', null, 'owner cannot delete devices directly');
select throws_ok($$ insert into public.device_members (device_id, user_id) values ('d0000000-0000-4000-8000-000000000001', tests.user_id('eve@example.test')) $$,
  '42501', null, 'owner cannot insert members directly');
select throws_ok($$ insert into public.device_invites (device_id, token_hash, created_by) values ('d0000000-0000-4000-8000-000000000001', '\x00', tests.user_id('alice@example.test')) $$,
  '42501', null, 'owner cannot insert invites directly');
select throws_ok($$ insert into public.cooks (device_id) values ('d0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'owner cannot insert cooks');
select throws_ok($$ update public.cooks set auto_stop = false $$, '42501', null, 'owner cannot update cooks');
select throws_ok($$ delete from public.cooks $$, '42501', null, 'owner cannot delete cooks');
select throws_ok($$ update public.device_members set created_at = now() $$, '42501', null, 'owner cannot update members');

-- owner renames --------------------------------------------------------------
select results_eq($$ update public.devices set name = 'Kitchen' returning name $$,
  $$ values ('Kitchen'::text) $$, 'owner can rename');

-- membership removal ---------------------------------------------------------
savepoint leave;
select tests.authenticate_as('bob@example.test');
select results_eq($$ delete from public.device_members returning user_id $$,
  $$ select tests.user_id('bob@example.test') $$, 'bob can leave');
select is_empty($$ select id from public.devices $$, 'bob sees nothing after leaving');
rollback to savepoint leave;

select tests.authenticate_as('alice@example.test');
select results_eq($$ delete from public.device_members returning user_id $$,
  $$ select tests.user_id('bob@example.test') $$, 'owner can remove bob');

-- unpair ---------------------------------------------------------------------
select lives_ok($$ select public.unpair_device('d0000000-0000-4000-8000-000000000001') $$, 'owner can unpair');
select tests.clear_authentication();
select is_empty($$ select id from public.devices $$, 'unpair deleted the device');
select is_empty($$ select id from public.cooks $$, 'unpair cascaded to cooks');

-- anon sees nothing ----------------------------------------------------------
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.devices $$, '42501', null, 'anon cannot read devices');
select throws_ok($$ select device_id from public.device_members $$, '42501', null, 'anon cannot read members');
select throws_ok($$ select id from public.device_invites $$, '42501', null, 'anon cannot read invites');
select throws_ok($$ select id from public.cooks $$, '42501', null, 'anon cannot read cooks');
select tests.clear_authentication();
-- Calling a function without EXECUTE currently segfaults the local Postgres
-- image (17.6.1.106), so anon's RPC access is asserted through the catalog.
select ok(not has_function_privilege('anon', 'public.create_device_invite(uuid)', 'execute'), 'anon cannot create invites');
select ok(not has_function_privilege('anon', 'public.accept_device_invite(text)', 'execute'), 'anon cannot accept invites');
select ok(not has_function_privilege('anon', 'public.unpair_device(uuid)', 'execute'), 'anon cannot unpair');
select ok(not has_function_privilege('anon', 'public.list_device_members(uuid)', 'execute'), 'anon cannot list members');
select ok(not has_function_privilege('anon', 'private.is_browser_session()', 'execute'), 'anon cannot use private helpers');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no usage on schema private');
select tests.clear_authentication();
select * from finish();
rollback;
