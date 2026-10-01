-- Invites: owner-only creation, hash-only storage, one-time, expiring (plan check 9).
begin;
\ir _helpers.psql
select * from no_plan();

create temporary table invite_tokens (name text primary key, token text not null);
grant select, insert, update on invite_tokens to authenticated;

select tests.authenticate_as('alice@example.test');
insert into invite_tokens values
  ('t1', public.create_device_invite('d0000000-0000-4000-8000-000000000001')),
  ('t2', public.create_device_invite('d0000000-0000-4000-8000-000000000001')),
  ('t3', public.create_device_invite('d0000000-0000-4000-8000-000000000001'));

select ok((select bool_and(token ~ '^[A-Za-z0-9_-]{43}$') from invite_tokens), 'tokens are 43-char base64url, no padding');
select results_eq($$ select count(*)::int from public.device_invites $$, $$ values (3) $$, 'owner sees the invites');
select tests.clear_authentication();

select ok(
  (select bool_and(i.token_hash = sha256(decode(translate(t.token, '-_', '+/') || '=', 'base64')))
   from invite_tokens t join public.device_invites i
     on i.token_hash = sha256(decode(translate(t.token, '-_', '+/') || '=', 'base64'))),
  'only the sha256 of the token is stored');
select is((select count(*)::int from public.device_invites i join invite_tokens t
           on encode(i.token_hash, 'escape') like '%' || t.token || '%'), 0, 'the raw token is not stored');
select ok((select bool_and(expires_at between now() + interval '7 days' - interval '1 minute'
                                           and now() + interval '7 days' + interval '1 minute')
           from public.device_invites), 'invites expire after 7 days');

-- eve accepts t1 -> becomes member
select tests.authenticate_as('eve@example.test');
select is(public.accept_device_invite((select token from invite_tokens where name = 't1')),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'eve accepts an invite and gets the device id');
select results_eq($$ select id from public.devices $$,
  $$ values ('d0000000-0000-4000-8000-000000000001'::uuid) $$, 'eve now sees the device');

-- one-time
select throws_ok(format('select public.accept_device_invite(%L)', (select token from invite_tokens where name = 't1')),
  '22023', 'invite_used', 'an invite cannot be used twice');
select tests.authenticate_as('bob@example.test');
select throws_ok(format('select public.accept_device_invite(%L)', (select token from invite_tokens where name = 't1')),
  '22023', 'invite_used', 'a used invite fails for another user too');

-- member accepting is a no-op that still consumes
select is(public.accept_device_invite((select token from invite_tokens where name = 't2')),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'an existing member can accept (no-op)');
select tests.clear_authentication();
select is((select count(*)::int from public.device_members where user_id = tests.user_id('bob@example.test')), 1,
  'no duplicate membership');
select isnt((select accepted_at from public.device_invites i join invite_tokens t
             on i.token_hash = sha256(decode(translate(t.token, '-_', '+/') || '=', 'base64')) where t.name = 't2'),
  null, 'the no-op accept still consumed the invite');

-- expired
update public.device_invites set expires_at = now() - interval '1 second'
where token_hash = (select sha256(decode(translate(token, '-_', '+/') || '=', 'base64')) from invite_tokens where name = 't3');
select tests.authenticate_as('eve@example.test');
select throws_ok(format('select public.accept_device_invite(%L)', (select token from invite_tokens where name = 't3')),
  '22023', 'invite_expired', 'an expired invite fails');

-- invalid
select throws_ok($$ select public.accept_device_invite('not-a-token') $$, '22023', 'invite_invalid', 'garbage token fails');
select throws_ok($$ select public.accept_device_invite(null) $$, '22023', 'invite_invalid', 'null token fails');
select throws_ok($$ select public.accept_device_invite('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') $$,
  '22023', 'invite_invalid', 'unknown token fails');

-- owner accepting is a no-op (owner is not a member row)
select tests.authenticate_as('alice@example.test');
insert into invite_tokens values ('t4', public.create_device_invite('d0000000-0000-4000-8000-000000000001'));
select is(public.accept_device_invite((select token from invite_tokens where name = 't4')),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'owner accepting is a no-op');
select tests.clear_authentication();
select is((select count(*)::int from public.device_members where user_id = tests.user_id('alice@example.test')), 0,
  'owner is not added as a member');

-- owner revokes; members cannot
insert into invite_tokens values ('t5', 'placeholder');
select tests.authenticate_as('alice@example.test');
update invite_tokens set token = public.create_device_invite('d0000000-0000-4000-8000-000000000001') where name = 't5';
select tests.authenticate_as('bob@example.test');
select is_empty($$ delete from public.device_invites returning id $$, 'a member cannot revoke invites');
select tests.authenticate_as('alice@example.test');
select isnt_empty($$ delete from public.device_invites where accepted_at is null returning id $$, 'owner can revoke invites');
select tests.authenticate_as('eve@example.test');
select throws_ok(format('select public.accept_device_invite(%L)', (select token from invite_tokens where name = 't5')),
  '22023', 'invite_invalid', 'a revoked invite fails');

-- an invite dies with its device
select tests.authenticate_as('alice@example.test');
insert into invite_tokens values ('t6', public.create_device_invite('d0000000-0000-4000-8000-000000000001'));
select public.unpair_device('d0000000-0000-4000-8000-000000000001');
select tests.authenticate_as('eve@example.test');
select throws_ok(format('select public.accept_device_invite(%L)', (select token from invite_tokens where name = 't6')),
  '22023', 'invite_invalid', 'an invite for an unpaired device fails');

select tests.clear_authentication();
select * from finish();
rollback;
