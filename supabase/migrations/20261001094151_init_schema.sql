-- Anova4All initial schema.
--
-- Access model:
--   * Browser sessions (role `authenticated`, aud = 'authenticated', no client_id,
--     not anonymous) read and manage data through RLS. Every policy and RPC for
--     authenticated/anon requires private.is_browser_session(), so OAuth app
--     tokens (MCP) and anonymous sessions see nothing through the Data API.
--   * The Go server connects as `anova_server` (no password here; the owner sets
--     it once) with its own grants and policies.
--   * `anon` gets nothing.

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

-- `private` is not listed in [api].schemas, so PostgREST never exposes it.
create schema if not exists private;
revoke all on schema private from public;
-- authenticated evaluates the helper functions inside RLS policies.
grant usage on schema private to authenticated;
-- supabase_auth_admin runs the access-token hook.
grant usage on schema private to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  id_card text not null unique,
  key_hash text not null, -- bcrypt hash of the key written over Bluetooth
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Anova'
    constraint devices_name_check
    check (char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.devices is 'Paired Anova cookers. The owner is owner_id; other users get access via device_members.';
comment on column public.devices.key_hash is 'bcrypt hash of the cooker key. Never readable by browser sessions.';

create index devices_owner_id_idx on public.devices (owner_id);

-- Non-owner members only; the owner is devices.owner_id.
create table public.device_members (
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (device_id, user_id)
);
comment on table public.device_members is 'Non-owner members of a device. The owner is devices.owner_id.';

-- device_id is covered by the primary key prefix.
create index device_members_user_id_idx on public.device_members (user_id);

create table public.device_invites (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  token_hash bytea not null unique, -- sha256 of the raw 32-byte token
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);
comment on table public.device_invites is 'One-time device invites. Only the sha256 of the token is stored.';

create index device_invites_device_id_idx on public.device_invites (device_id);
create index device_invites_created_by_idx on public.device_invites (created_by);
create index device_invites_accepted_by_idx on public.device_invites (accepted_by);

create table public.cooks (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  auto_stop boolean not null default false,
  ended_at timestamptz,
  -- auto_stop: server stopped at timer end; stopped: user stopped via app/MCP;
  -- manual: heating ended from the cooker or a leftover row was closed.
  end_reason text check (end_reason in ('auto_stop', 'stopped', 'manual')),
  constraint cooks_end_consistent check ((ended_at is null) = (end_reason is null))
);
comment on table public.cooks is 'Cook records: auto-stop flag and why the cook ended. Written only by the Go server.';

-- At most one open cook per device.
create unique index cooks_one_open_per_device_idx on public.cooks (device_id) where ended_at is null;
-- FK index plus "latest cook for a device".
create index cooks_device_id_started_at_idx on public.cooks (device_id, started_at desc);
create index cooks_started_by_idx on public.cooks (started_by);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger devices_set_updated_at
before update on public.devices
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions (private, security definer)
-- ---------------------------------------------------------------------------

-- True only for a first-party browser session: aud = 'authenticated',
-- no OAuth client_id claim, and not an anonymous user.
-- Supabase Auth may encode aud as a string or a one-element array; both are
-- accepted, anything else (other audiences, several audiences) is not.
create function private.is_browser_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      (pg_catalog.jsonb_typeof(c -> 'aud') = 'string' and (c ->> 'aud') = 'authenticated')
      or (c -> 'aud') = '["authenticated"]'::jsonb
    )
    and not (c ? 'client_id')
    and (c ->> 'is_anonymous') is distinct from 'true',
    false
  )
  from (select auth.jwt() as c) as jwt;
$$;

create function private.is_device_owner(p_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.devices d
    where d.id = p_device_id
      and d.owner_id = (select auth.uid())
  );
$$;

-- Owner or member.
create function private.is_device_member(p_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.devices d
    where d.id = p_device_id
      and d.owner_id = (select auth.uid())
  ) or exists (
    select 1
    from public.device_members m
    where m.device_id = p_device_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_browser_session() from public, anon;
revoke execute on function private.is_device_owner(uuid) from public, anon;
revoke execute on function private.is_device_member(uuid) from public, anon;
grant execute on function private.is_browser_session() to authenticated;
grant execute on function private.is_device_owner(uuid) to authenticated;
grant execute on function private.is_device_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.devices enable row level security;
alter table public.device_members enable row level security;
alter table public.device_invites enable row level security;
alter table public.cooks enable row level security;

-- Supabase default privileges grant everything on new public tables to anon
-- and authenticated. Start from nothing and grant explicitly.
revoke all on table public.devices from anon, authenticated;
revoke all on table public.device_members from anon, authenticated;
revoke all on table public.device_invites from anon, authenticated;
revoke all on table public.cooks from anon, authenticated;

-- devices: members read (never key_hash); only the owner renames.
grant select (id, id_card, owner_id, name, last_seen_at, created_at, updated_at)
  on table public.devices to authenticated;
grant update (name) on table public.devices to authenticated;

create policy "devices: members can read"
on public.devices for select
to authenticated
using ((select private.is_browser_session()) and (select private.is_device_member(id)));

create policy "devices: owner can rename"
on public.devices for update
to authenticated
using ((select private.is_browser_session()) and (select private.is_device_owner(id)))
with check ((select private.is_browser_session()) and (select private.is_device_owner(id)));

-- device_members: members read the list; the owner removes anyone, a member can leave.
grant select, delete on table public.device_members to authenticated;

create policy "device_members: members can read"
on public.device_members for select
to authenticated
using ((select private.is_browser_session()) and (select private.is_device_member(device_id)));

create policy "device_members: owner removes or member leaves"
on public.device_members for delete
to authenticated
using (
  (select private.is_browser_session())
  and (
    (select private.is_device_owner(device_id))
    or user_id = (select auth.uid())
  )
);

-- device_invites: the owner lists (never token_hash) and revokes. Creation via RPC.
grant select (id, device_id, created_by, created_at, expires_at, accepted_by, accepted_at)
  on table public.device_invites to authenticated;
grant delete on table public.device_invites to authenticated;

create policy "device_invites: owner can read"
on public.device_invites for select
to authenticated
using ((select private.is_browser_session()) and (select private.is_device_owner(device_id)));

create policy "device_invites: owner can revoke"
on public.device_invites for delete
to authenticated
using ((select private.is_browser_session()) and (select private.is_device_owner(device_id)));

-- cooks: members read.
grant select on table public.cooks to authenticated;

create policy "cooks: members can read"
on public.cooks for select
to authenticated
using ((select private.is_browser_session()) and (select private.is_device_member(device_id)));

-- ---------------------------------------------------------------------------
-- RPCs (browser sessions only)
-- ---------------------------------------------------------------------------

-- Errors raised (message is the code):
--   not_browser_session (42501), not_owner (42501), not_member (42501),
--   invite_invalid (22023), invite_expired (22023), invite_used (22023)

create function public.create_device_invite(p_device_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token bytea;
begin
  if not private.is_browser_session() then
    raise exception 'not_browser_session' using errcode = '42501';
  end if;
  if not private.is_device_owner(p_device_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  v_token := extensions.gen_random_bytes(32);

  insert into public.device_invites (device_id, token_hash, created_by)
  values (p_device_id, pg_catalog.sha256(v_token), (select auth.uid()));

  -- base64url without padding (32 bytes -> 43 chars).
  return pg_catalog.translate(pg_catalog.encode(v_token, 'base64'), E'+/=\n', '-_');
end;
$$;

create function public.accept_device_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_raw bytea;
  v_b64 text;
  v_invite public.device_invites%rowtype;
begin
  if not private.is_browser_session() or v_uid is null then
    raise exception 'not_browser_session' using errcode = '42501';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invite_invalid' using errcode = '22023';
  end if;

  v_b64 := pg_catalog.translate(p_token, '-_', '+/') || '=';
  begin
    v_raw := pg_catalog.decode(v_b64, 'base64');
  exception when others then
    raise exception 'invite_invalid' using errcode = '22023';
  end;
  if pg_catalog.length(v_raw) <> 32 then
    raise exception 'invite_invalid' using errcode = '22023';
  end if;

  select i.*
  into v_invite
  from public.device_invites i
  where i.token_hash = pg_catalog.sha256(v_raw)
  for update;

  if not found then
    raise exception 'invite_invalid' using errcode = '22023';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite_used' using errcode = '22023';
  end if;
  if v_invite.expires_at <= pg_catalog.now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;

  update public.device_invites
  set accepted_by = v_uid,
      accepted_at = pg_catalog.now()
  where id = v_invite.id;

  -- The owner is not a member row; an existing member is a no-op.
  insert into public.device_members (device_id, user_id)
  select v_invite.device_id, v_uid
  where not exists (
    select 1 from public.devices d
    where d.id = v_invite.device_id and d.owner_id = v_uid
  )
  on conflict (device_id, user_id) do nothing;

  return v_invite.device_id;
end;
$$;

create function public.unpair_device(p_device_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_browser_session() then
    raise exception 'not_browser_session' using errcode = '42501';
  end if;
  if not private.is_device_owner(p_device_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  delete from public.devices d where d.id = p_device_id;
end;
$$;

create function public.list_device_members(p_device_id uuid)
returns table (user_id uuid, email text, is_owner boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_browser_session() then
    raise exception 'not_browser_session' using errcode = '42501';
  end if;
  if not private.is_device_member(p_device_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text, true
  from public.devices d
  join auth.users u on u.id = d.owner_id
  where d.id = p_device_id
  union all
  select u.id, u.email::text, false
  from public.device_members m
  join auth.users u on u.id = m.user_id
  where m.device_id = p_device_id
  order by 3 desc, 2;
end;
$$;

revoke execute on function public.create_device_invite(uuid) from public, anon;
revoke execute on function public.accept_device_invite(text) from public, anon;
revoke execute on function public.unpair_device(uuid) from public, anon;
revoke execute on function public.list_device_members(uuid) from public, anon;
grant execute on function public.create_device_invite(uuid) to authenticated;
grant execute on function public.accept_device_invite(text) to authenticated;
grant execute on function public.unpair_device(uuid) to authenticated;
grant execute on function public.list_device_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Go server role
-- ---------------------------------------------------------------------------

-- Created without a password; the owner sets it once (ALTER ROLE ... PASSWORD)
-- and keeps it only in the Pi env file.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anova_server') then
    create role anova_server login noinherit;
  end if;
end;
$$;

grant usage on schema public to anova_server;

grant select, insert, update, delete on table public.devices to anova_server;
grant select, insert, delete on table public.device_members to anova_server;
-- select (without token_hash) is needed for DELETE ... WHERE device_id = ...
grant select (id, device_id, created_by, created_at, expires_at, accepted_by, accepted_at)
  on table public.device_invites to anova_server;
grant delete on table public.device_invites to anova_server;
grant select, insert, update on table public.cooks to anova_server;

create policy "devices: server full access"
on public.devices for all
to anova_server
using (true)
with check (true);

create policy "device_members: server read"
on public.device_members for select
to anova_server
using (true);

create policy "device_members: server insert"
on public.device_members for insert
to anova_server
with check (true);

create policy "device_members: server delete"
on public.device_members for delete
to anova_server
using (true);

create policy "device_invites: server read"
on public.device_invites for select
to anova_server
using (true);

create policy "device_invites: server delete"
on public.device_invites for delete
to anova_server
using (true);

create policy "cooks: server read"
on public.cooks for select
to anova_server
using (true);

create policy "cooks: server insert"
on public.cooks for insert
to anova_server
with check (true);

create policy "cooks: server update"
on public.cooks for update
to anova_server
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- Custom access token hook
-- ---------------------------------------------------------------------------

-- OAuth 2.1 server tokens carry a client_id claim. Give them their own audience
-- so they are refused wherever aud = 'authenticated' is required (Go /api, RLS).
-- Browser tokens pass through unchanged.
create function private.custom_access_token_hook(event jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(event -> 'claims' ->> 'client_id', '') <> ''
      then pg_catalog.jsonb_set(event, '{claims,aud}', '"anova4all-mcp"'::jsonb)
    else event
  end;
$$;

revoke execute on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;
