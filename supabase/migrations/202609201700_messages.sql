-- Use the existing messages table when present; create the expected fields only
-- for installations that do not yet have the table.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> receiver_id),
  constraint messages_content_not_empty check (length(btrim(content)) > 0)
);

alter table public.messages add column if not exists content text;
alter table public.messages add column if not exists is_read boolean not null default false;
alter table public.messages add column if not exists created_at timestamptz not null default now();
alter table public.messages enable row level security;

drop policy if exists "Users read their messages" on public.messages;
create policy "Users read their messages" on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Connected users send messages" on public.messages;
create policy "Connected users send messages" on public.messages for insert
  with check (
    auth.uid() = sender_id and sender_id <> receiver_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.sender_id = sender_id and fr.receiver_id = receiver_id)
          or (fr.sender_id = receiver_id and fr.receiver_id = sender_id))
    )
  );

drop policy if exists "Recipients mark messages read" on public.messages;
create policy "Recipients mark messages read" on public.messages for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications(user_id, actor_id, type, message)
  values (new.receiver_id, new.sender_id, 'message',
    coalesce((select full_name from public.profiles where id = new.sender_id), 'Someone')
    || ' sent you a new message.');
  return new;
end;
$$;

drop trigger if exists message_notification on public.messages;
create trigger message_notification after insert on public.messages
for each row execute function public.notify_new_message();

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end
$$;
alter table public.messages replica identity full;
