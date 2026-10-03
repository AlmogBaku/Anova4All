-- Device name rules and the one-open-cook rule.
begin;
\ir _helpers.psql
select * from no_plan();

select tests.authenticate_as('alice@example.test');
select lives_ok($$ update public.devices set name = repeat('a', 40) $$, 'a 40-character name is accepted');
select lives_ok($$ update public.devices set name = 'Kitchen 🍲 cooker' $$, 'unicode names are accepted');
select throws_ok($$ update public.devices set name = repeat('a', 41) $$, '23514', null, 'a 41-character name is refused');
select throws_ok($$ update public.devices set name = '' $$, '23514', null, 'an empty name is refused');
select throws_ok($$ update public.devices set name = E'bad\nname' $$, '23514', null, 'a newline is refused');
select throws_ok($$ update public.devices set name = E'bad\tname' $$, '23514', null, 'a tab is refused');
select throws_ok($$ update public.devices set name = E'bad\x01name' $$, '23514', null, 'a control character is refused');
select throws_ok($$ update public.devices set name = E'bad\x7fname' $$, '23514', null, 'DEL is refused');
select throws_ok($$ update public.devices set name = null $$, '23502', null, 'a null name is refused');
select tests.clear_authentication();

select is((select name from public.devices), 'Kitchen 🍲 cooker', 'name kept the last valid value');
select ok((select updated_at = now() from public.devices), 'updated_at trigger ran');

-- cooks: one open cook per device
select throws_ok($$ insert into public.cooks (device_id) values ('d0000000-0000-4000-8000-000000000001') $$,
  '23505', null, 'a second open cook is refused');
select lives_ok($$ update public.cooks set ended_at = now(), end_reason = 'stopped' where ended_at is null $$,
  'the open cook can be closed');
select lives_ok($$ insert into public.cooks (device_id) values ('d0000000-0000-4000-8000-000000000001') $$,
  'a new cook can start after the old one ended');
select throws_ok($$ update public.cooks set ended_at = now(), end_reason = 'timer' where ended_at is null $$,
  '23514', null, 'an unknown end_reason is refused');
select throws_ok($$ update public.cooks set ended_at = now() where ended_at is null $$,
  '23514', null, 'ended_at requires end_reason');
select is((select auto_stop from public.cooks where ended_at is null), false, 'auto_stop defaults to off');
select is((select timer_waiting from public.cooks where ended_at is null), false, 'timer_waiting defaults to off');
select is((select name from public.devices where id_card = 'anova f00000000000000000000000'), 'Kitchen 🍲 cooker', 'sanity');

select * from finish();
rollback;
