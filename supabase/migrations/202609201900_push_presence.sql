create table if not exists public.active_chat_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint active_chat_presence_not_self check (user_id <> chat_user_id)
);

alter table public.active_chat_presence enable row level security;
drop policy if exists "Users manage their own chat presence" on public.active_chat_presence;
create policy "Users manage their own chat presence"
  on public.active_chat_presence for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists active_chat_presence_chat_user_idx
  on public.active_chat_presence(chat_user_id);
