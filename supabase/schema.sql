-- PULSIFY DATABASE SETUP
-- Run the entire file in Supabase Dashboard > SQL Editor > New query.
-- This creates the core community/chat schema and enables Row Level Security.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null default 'Member',
  bio text not null default '',
  avatar_url text,
  banner_url text,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  xp integer not null default 0,
  level integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  icon_url text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  joined_at timestamptz not null default now(),
  primary key(server_id,user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null,
  topic text not null default '',
  type text not null default 'text' check (type in ('text','announcement')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  attachment_url text,
  attachment_name text,
  reply_to uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  constraint message_has_content check (length(content) > 0 or attachment_url is not null)
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(message_id,user_id,emoji)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  unique(requester_id,addressee_id),
  check(requester_id <> addressee_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  server_id uuid references public.servers(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text not null default '',
  icon text not null default '🏅'
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id,badge_id)
);

create index if not exists messages_channel_created_idx on public.messages(channel_id,created_at);
create index if not exists channels_server_position_idx on public.channels(server_id,position);
create index if not exists server_members_user_idx on public.server_members(user_id);

-- Automatically create a profile when a new Auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base_name text;
begin
  base_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1), 'member');
  insert into public.profiles(id,username,display_name)
  values(new.id, lower(regexp_replace(base_name,'[^a-zA-Z0-9_]','','g')) || '_' || substr(new.id::text,1,5), base_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Membership helper prevents recursive RLS policy lookups.
create or replace function public.is_server_member(target_server uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.server_members sm where sm.server_id=target_server and sm.user_id=auth.uid());
$$;

create or replace function public.is_server_staff(target_server uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.server_members sm where sm.server_id=target_server and sm.user_id=auth.uid() and sm.role in ('owner','admin','moderator'));
$$;

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- Profiles are visible to signed-in users; each user edits only their own.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles for insert to authenticated with check (id=auth.uid());

-- Servers: members can view; signed-in users can create; only owner can update/delete.
drop policy if exists "members view servers" on public.servers;
create policy "members view servers" on public.servers for select to authenticated using (public.is_server_member(id) or owner_id=auth.uid());
drop policy if exists "users create servers" on public.servers;
create policy "users create servers" on public.servers for insert to authenticated with check (owner_id=auth.uid());
drop policy if exists "owner updates server" on public.servers;
create policy "owner updates server" on public.servers for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists "owner deletes server" on public.servers;
create policy "owner deletes server" on public.servers for delete to authenticated using (owner_id=auth.uid());

-- Members can see membership lists; only owner/admin can manage memberships.
drop policy if exists "members view server roster" on public.server_members;
create policy "members view server roster" on public.server_members for select to authenticated using (public.is_server_member(server_id) or user_id=auth.uid());
drop policy if exists "user joins own membership" on public.server_members;
create policy "user joins own membership" on public.server_members for insert to authenticated with check (user_id=auth.uid() and (role='member' or exists(select 1 from public.servers s where s.id=server_id and s.owner_id=auth.uid())));
drop policy if exists "staff updates membership" on public.server_members;
create policy "staff updates membership" on public.server_members for update to authenticated using (public.is_server_staff(server_id)) with check (public.is_server_staff(server_id));
drop policy if exists "staff removes membership" on public.server_members;
create policy "staff removes membership" on public.server_members for delete to authenticated using (public.is_server_staff(server_id) or user_id=auth.uid());

-- Channels and messages require server membership.
drop policy if exists "members read channels" on public.channels;
create policy "members read channels" on public.channels for select to authenticated using (public.is_server_member(server_id));
drop policy if exists "staff create channels" on public.channels;
create policy "staff create channels" on public.channels for insert to authenticated with check (public.is_server_staff(server_id));
drop policy if exists "staff update channels" on public.channels;
create policy "staff update channels" on public.channels for update to authenticated using (public.is_server_staff(server_id)) with check (public.is_server_staff(server_id));
drop policy if exists "staff delete channels" on public.channels;
create policy "staff delete channels" on public.channels for delete to authenticated using (public.is_server_staff(server_id));

drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages for select to authenticated using (exists(select 1 from public.channels c where c.id=channel_id and public.is_server_member(c.server_id)));
drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages for insert to authenticated with check (author_id=auth.uid() and exists(select 1 from public.channels c where c.id=channel_id and public.is_server_member(c.server_id)));
drop policy if exists "authors edit messages" on public.messages;
create policy "authors edit messages" on public.messages for update to authenticated using (author_id=auth.uid() or exists(select 1 from public.channels c where c.id=channel_id and public.is_server_staff(c.server_id))) with check (author_id=auth.uid() or exists(select 1 from public.channels c where c.id=channel_id and public.is_server_staff(c.server_id)));

drop policy if exists "members read reactions" on public.reactions;
create policy "members read reactions" on public.reactions for select to authenticated using (exists(select 1 from public.messages m join public.channels c on c.id=m.channel_id where m.id=message_id and public.is_server_member(c.server_id)));
drop policy if exists "members add own reactions" on public.reactions;
create policy "members add own reactions" on public.reactions for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.messages m join public.channels c on c.id=m.channel_id where m.id=message_id and public.is_server_member(c.server_id)));
drop policy if exists "users remove own reactions" on public.reactions;
create policy "users remove own reactions" on public.reactions for delete to authenticated using (user_id=auth.uid());

-- Friend requests are visible only to the two participants.
drop policy if exists "participants view friendships" on public.friendships;
create policy "participants view friendships" on public.friendships for select to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid());
drop policy if exists "users send friend requests" on public.friendships;
create policy "users send friend requests" on public.friendships for insert to authenticated with check (requester_id=auth.uid());
drop policy if exists "participants update friendships" on public.friendships;
create policy "participants update friendships" on public.friendships for update to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid()) with check (requester_id=auth.uid() or addressee_id=auth.uid());
drop policy if exists "participants remove friendships" on public.friendships;
create policy "participants remove friendships" on public.friendships for delete to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid());

-- DMs are readable only by sender/recipient.
drop policy if exists "participants read dms" on public.direct_messages;
create policy "participants read dms" on public.direct_messages for select to authenticated using (sender_id=auth.uid() or recipient_id=auth.uid());
drop policy if exists "users send dms" on public.direct_messages;
create policy "users send dms" on public.direct_messages for insert to authenticated with check (sender_id=auth.uid());
drop policy if exists "sender deletes dms" on public.direct_messages;
create policy "sender deletes dms" on public.direct_messages for delete to authenticated using (sender_id=auth.uid());

-- Users can submit reports; only server staff can read reports for their servers (global moderation is intentionally not exposed here).
drop policy if exists "users submit reports" on public.reports;
create policy "users submit reports" on public.reports for insert to authenticated with check (reporter_id=auth.uid());
drop policy if exists "reporter views own reports" on public.reports;
create policy "reporter views own reports" on public.reports for select to authenticated using (reporter_id=auth.uid());

drop policy if exists "members read audit logs" on public.audit_logs;
create policy "members read audit logs" on public.audit_logs for select to authenticated using (public.is_server_staff(server_id));
drop policy if exists "signed in create audit entries" on public.audit_logs;
create policy "signed in create audit entries" on public.audit_logs for insert to authenticated with check (actor_id=auth.uid() and public.is_server_staff(server_id));

drop policy if exists "badges readable" on public.badges;
create policy "badges readable" on public.badges for select to authenticated using (true);
drop policy if exists "user badges readable" on public.user_badges;
create policy "user badges readable" on public.user_badges for select to authenticated using (true);

-- Realtime updates for messages. If already in publication, the DO block safely skips it.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- Storage bucket for attachments. Public URLs are readable by anyone who has the link;
-- do not upload private documents or sensitive information.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pulsify-uploads','pulsify-uploads',true,8388608,
  array['image/png','image/jpeg','image/gif','image/webp','application/pdf','text/plain'])
on conflict (id) do update set file_size_limit=8388608, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "signed in upload own files" on storage.objects;
create policy "signed in upload own files" on storage.objects for insert to authenticated
with check (bucket_id='pulsify-uploads' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "public read pulsify files" on storage.objects;
create policy "public read pulsify files" on storage.objects for select to public using (bucket_id='pulsify-uploads');
drop policy if exists "owners delete own files" on storage.objects;
create policy "owners delete own files" on storage.objects for delete to authenticated
using (bucket_id='pulsify-uploads' and (storage.foldername(name))[1]=auth.uid()::text);

-- Starter badges
insert into public.badges(name,description,icon) values
('Early Pulsifier','Joined during the first community launch.','🌟'),
('Helpful Member','Recognized for helping the community.','🤝'),
('Community Builder','Helped grow a welcoming server.','🏗️')
on conflict (name) do nothing;
