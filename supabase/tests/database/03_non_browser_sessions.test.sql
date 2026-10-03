-- App (OAuth/MCP) tokens and anonymous sessions see no rows and run no RPC (plan check 9).
begin;
\ir _helpers.psql
select * from no_plan();

-- An invite token created by the owner, used to prove accept is refused.
create temporary table invite_tokens (token text not null);
grant select, insert on invite_tokens to authenticated;
select tests.authenticate_as('alice@example.test');
insert into invite_tokens values (public.create_device_invite('d0000000-0000-4000-8000-000000000001'));
select tests.clear_authentication();

create function pg_temp.check_session(p_label text) returns setof text language plpgsql as $f$
begin
  -- alice is the owner: a browser session would see and manage everything.
  return next is_empty($$ select id from public.devices $$, p_label || ': sees no devices');
  return next is_empty($$ select device_id from public.device_members $$, p_label || ': sees no members');
  return next is_empty($$ select id from public.device_invites $$, p_label || ': sees no invites');
  return next is_empty($$ select id from public.cooks $$, p_label || ': sees no cooks');
  return next is_empty($$ update public.devices set name = 'App' returning id $$, p_label || ': cannot rename');
  return next is_empty($$ delete from public.device_members returning user_id $$, p_label || ': cannot remove members');
  return next is_empty($$ delete from public.device_invites returning id $$, p_label || ': cannot revoke invites');
  return next throws_ok($$ select public.create_device_invite('d0000000-0000-4000-8000-000000000001') $$,
    '42501', 'not_browser_session', p_label || ': cannot create invites');
  return next throws_ok(format('select public.accept_device_invite(%L)', (select token from invite_tokens)),
    '42501', 'not_browser_session', p_label || ': cannot accept invites');
  return next throws_ok($$ select public.unpair_device('d0000000-0000-4000-8000-000000000001') $$,
    '42501', 'not_browser_session', p_label || ': cannot unpair');
  return next throws_ok($$ select * from public.list_device_members('d0000000-0000-4000-8000-000000000001') $$,
    '42501', 'not_browser_session', p_label || ': cannot list members');
  return next ok(not private.is_browser_session(), p_label || ': is not a browser session');
end;
$f$;
grant execute on function pg_temp.check_session(text) to authenticated;

-- Control: the same owner with a browser session does see the device.
select tests.authenticate_as('alice@example.test');
select isnt_empty($$ select id from public.devices $$, 'browser session control: owner sees the device');
select ok(private.is_browser_session(), 'browser session control: is a browser session');

select tests.set_claims('alice@example.test', '{"aud":["authenticated"]}');
select ok(private.is_browser_session(), 'browser session control: aud as a one-element array is accepted');
select isnt_empty($$ select id from public.devices $$, 'browser session control: array aud sees the device');

select tests.authenticate_as_app('alice@example.test');
select pg_temp.check_session('app token (aud anova4all-mcp, client_id)');

select tests.authenticate_as_app_unhooked('alice@example.test');
select pg_temp.check_session('client_id with aud authenticated');

select tests.authenticate_as_anonymous('alice@example.test');
select pg_temp.check_session('anonymous session');

select tests.set_claims('alice@example.test', '{"aud":"anova4all-mcp"}');
select pg_temp.check_session('foreign aud without client_id');

select tests.set_claims('alice@example.test', '{"aud":["anova4all-mcp"],"client_id":"9a8b7c6d-0000-4000-8000-000000000001"}');
select pg_temp.check_session('app token with array aud');

select tests.set_claims('alice@example.test', '{"aud":["authenticated","anova4all-mcp"]}');
select pg_temp.check_session('several audiences');

select tests.set_claims('alice@example.test', '{"client_id":null}');
select pg_temp.check_session('client_id claim present but null');

select tests.clear_authentication();
select is((select accepted_at from public.device_invites), null, 'the invite was not consumed');
select * from finish();
rollback;
