create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_request_not_self check (sender_id <> receiver_id)
);
create unique index if not exists friend_request_one_pair on public.friend_requests(least(sender_id,receiver_id), greatest(sender_id,receiver_id)) where status in ('pending','accepted');

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
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_verification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  paystack_customer_code text,
  paystack_subscription_code text unique,
  paystack_email_token text,
  plan_code text not null,
  amount integer not null default 100000,
  status text not null check (status in ('pending','active','cancelled','failed','expired','inactive')),
  next_payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.friend_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.communities enable row level security;
alter table public.posts enable row level security;
alter table public.community_verification_subscriptions enable row level security;

create policy "Profiles are publicly readable" on public.profiles for select using (true);
create policy "Users update their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users create requests as themselves" on public.friend_requests for insert with check (auth.uid() = sender_id);
create policy "Users read their requests" on public.friend_requests for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Receivers accept or decline requests" on public.friend_requests for update using (auth.uid() = receiver_id or auth.uid() = sender_id) with check (auth.uid() = receiver_id or auth.uid() = sender_id);
create policy "Users read their notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "Users mark their notifications read" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Communities are public" on public.communities for select using (true);
create policy "Owners create communities" on public.communities for insert with check (auth.uid() = owner_id);
create policy "Owners update communities" on public.communities for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Posts are public" on public.posts for select using (true);
create policy "Users create their own posts" on public.posts for insert with check (auth.uid() = author_id);
create policy "Users edit their own posts" on public.posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "Users delete their own posts" on public.posts for delete using (auth.uid() = author_id);
create policy "Owners read community subscriptions" on public.community_verification_subscriptions for select using (auth.uid() = owner_id);

create or replace function public.notify_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, actor_id, type, message)
  values (new.receiver_id, new.sender_id, 'friend_request', 'Someone sent you a friend request.');
  return new;
end;
$$;
drop trigger if exists friend_request_notification on public.friend_requests;
create trigger friend_request_notification after insert on public.friend_requests
for each row execute function public.notify_friend_request();

create or replace function public.sync_friend_request_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    insert into public.notifications(user_id, actor_id, type, message)
    values (new.sender_id, new.receiver_id, 'friend_request_accepted', 'Your friend request was accepted.');
  end if;
  return new;
end;
$$;
drop trigger if exists friend_request_status_notification on public.friend_requests;
create trigger friend_request_status_notification after update of status on public.friend_requests
for each row execute function public.sync_friend_request_status();
