-- The access-token hook only changes aud when client_id is set, and only
-- supabase_auth_admin can run it (plan check 9).
begin;
\ir _helpers.psql
select * from no_plan();

select is(
  private.custom_access_token_hook('{"user_id":"u1","authentication_method":"oauth","claims":{"sub":"u1","aud":"authenticated","role":"authenticated","client_id":"c1","is_anonymous":false}}'),
  '{"user_id":"u1","authentication_method":"oauth","claims":{"sub":"u1","aud":"anova4all-mcp","role":"authenticated","client_id":"c1","is_anonymous":false}}'::jsonb,
  'client_id set: aud becomes anova4all-mcp and nothing else changes');

select is(
  private.custom_access_token_hook('{"user_id":"u1","authentication_method":"password","claims":{"sub":"u1","aud":"authenticated","role":"authenticated","is_anonymous":false}}'),
  '{"user_id":"u1","authentication_method":"password","claims":{"sub":"u1","aud":"authenticated","role":"authenticated","is_anonymous":false}}'::jsonb,
  'no client_id: event unchanged');

select is(
  private.custom_access_token_hook('{"claims":{"aud":"authenticated","client_id":null}}'),
  '{"claims":{"aud":"authenticated","client_id":null}}'::jsonb,
  'null client_id: event unchanged');

select is(
  private.custom_access_token_hook('{"claims":{"aud":"authenticated","client_id":""}}'),
  '{"claims":{"aud":"authenticated","client_id":""}}'::jsonb,
  'empty client_id: event unchanged');

select is(
  private.custom_access_token_hook('{"client_id":"c1","claims":{"aud":"authenticated"}}'),
  '{"client_id":"c1","claims":{"aud":"authenticated"}}'::jsonb,
  'only claims.client_id counts');

select is(
  private.custom_access_token_hook('{"claims":{"aud":["authenticated"],"client_id":"c1"}}'),
  '{"claims":{"aud":"anova4all-mcp","client_id":"c1"}}'::jsonb,
  'array aud with client_id: replaced by anova4all-mcp');

select ok(has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'supabase_auth_admin can execute the hook');
select ok(has_schema_privilege('supabase_auth_admin', 'private', 'usage'), 'supabase_auth_admin can use schema private');
select ok(not has_function_privilege('authenticated', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'authenticated cannot execute the hook');
select ok(not has_function_privilege('anon', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'anon cannot execute the hook');
select ok(not has_function_privilege('anova_server', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'anova_server cannot execute the hook');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p, aclexplode(p.proacl) a
  where p.oid = 'private.custom_access_token_hook(jsonb)'::regprocedure and a.grantee = 0),
  'PUBLIC has no execute on the hook');
select ok((select prolang = (select oid from pg_language where lanname = 'sql') and not prosecdef
           from pg_proc where oid = 'private.custom_access_token_hook(jsonb)'::regprocedure),
  'the hook is pure SQL and not security definer');

select * from finish();
rollback;
