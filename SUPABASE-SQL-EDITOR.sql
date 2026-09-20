-- BOOPA: run this entire script in Supabase SQL Editor.
-- It is safe to rerun and does not delete tables or user data.

begin;

-- Base tables. These are created only when they do not already exist.
-- Existing rows and columns are preserved.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  university text,
  department text,
  level text,
  number text,
  avatar_url text,
  bio text,
  is_verified boolean not null default false,
  verification_status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  cat text not null default 'General',
  whatsapp_group_link text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile fields used by the existing frontend.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists level text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists number text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists verification_status text not null default 'inactive';

-- Communities/posts fields used by the existing frontend.
alter table public.communities add column if not exists university text not null default '';
alter table public.communities add column if not exists department text;
alter table public.communities add column if not exists whatsapp_link text;

-- Friend requests and notifications.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_request_not_self check (sender_id <> receiver_id)
);

alter table public.notifications add column if not exists actor_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_actor_id_fkey'
  ) then
    alter table public.notifications
      add constraint notifications_actor_id_fkey
      foreign key (actor_id) references public.profiles(id) on delete set null;
  end if;
end $$;

create unique index if not exists friend_request_one_pair
  on public.friend_requests(least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status in ('pending', 'accepted');

-- Profile verification subscriptions.
create table if not exists public.verification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paystack_reference text,
  paystack_authorization_url text,
  paystack_access_code text,
  paystack_customer_code text,
  paystack_subscription_code text unique,
  paystack_email_token text,
  paystack_plan_code text not null,
  status text not null
    check (status in ('pending', 'active', 'cancelled', 'failed', 'expired', 'inactive')),
  amount integer not null,
  currency text not null default 'NGN',
  started_at timestamptz,
  next_payment_date timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.verification_subscriptions
  add column if not exists paystack_reference text;

drop index if exists public.verification_one_current_subscription;

create unique index if not exists verification_paystack_reference_idx
  on public.verification_subscriptions(paystack_reference)
  where paystack_reference is not null;

create unique index if not exists verification_one_active_per_user
  on public.verification_subscriptions(user_id)
  where status = 'active';

-- Preserve subscription history while clearing abandoned checkout attempts.
-- update public.verification_subscriptions
-- set status = 'cancelled', cancelled_at = now()
-- where status = 'pending';

-- Keep RLS enabled.
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.communities enable row level security;
alter table public.verification_subscriptions enable row level security;

-- Profile policies.
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prevent browser clients from changing verification fields.
create or replace function public.prevent_client_verification_changes()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.role() = 'authenticated'
     and (new.is_verified is distinct from old.is_verified
       or new.verification_status is distinct from old.verification_status) then
    raise exception 'Verification status is managed by the payment backend';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_verification on public.profiles;
create trigger protect_profile_verification
before update on public.profiles
for each row execute function public.prevent_client_verification_changes();

-- Friend-request policies.
drop policy if exists "Users create requests as themselves" on public.friend_requests;
create policy "Users create requests as themselves"
  on public.friend_requests for insert
  with check (auth.uid() = sender_id and sender_id <> receiver_id);

drop policy if exists "Users read their requests" on public.friend_requests;
create policy "Users read their requests"
  on public.friend_requests for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Receivers accept or decline requests" on public.friend_requests;
drop policy if exists "Users update their own friend requests" on public.friend_requests;
create policy "Receivers accept or decline requests"
  on public.friend_requests for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Notification policies.
drop policy if exists "Users read their notifications" on public.notifications;
create policy "Users read their notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users mark their notifications read" on public.notifications;
create policy "Users mark their notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Verification status is readable only by the signed-in owner.
drop policy if exists "Users can read their own verification subscription" on public.verification_subscriptions;
create policy "Users can read their own verification subscription"
  on public.verification_subscriptions for select
  using (auth.uid() = user_id);

-- Avatar bucket and owner-only write policies.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Existing notification behavior.
create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, actor_id, type, message)
  values (new.receiver_id, new.sender_id, 'friend_request',
          'Someone sent you a friend request.');
  return new;
end;
$$;

drop trigger if exists friend_request_notification on public.friend_requests;
create trigger friend_request_notification
after insert on public.friend_requests
for each row execute function public.notify_friend_request();

create or replace function public.sync_friend_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    insert into public.notifications(user_id, actor_id, type, message)
    values (new.sender_id, new.receiver_id, 'friend_request_accepted',
            'Your friend request was accepted.');
  end if;
  return new;
end;
$$;

drop trigger if exists friend_request_status_notification on public.friend_requests;
create trigger friend_request_status_notification
after update of status on public.friend_requests
for each row execute function public.sync_friend_request_status();

notify pgrst, 'reload schema';
commit;
