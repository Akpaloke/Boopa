-- Requested community, avatar, payment, and connection privacy fixes.

alter table public.communities add column if not exists university text not null default '';
alter table public.communities add column if not exists department text;
alter table public.communities add column if not exists whatsapp_link text;

update public.communities
set whatsapp_link = whatsapp_group_link
where whatsapp_link is null and whatsapp_group_link is not null;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create or replace function public.get_connected_whatsapp(target_user_id uuid)
returns table (number text)
language sql
security definer
set search_path = public
as $$
  select p.number
  from public.profiles p
  where p.id = target_user_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.sender_id = auth.uid() and fr.receiver_id = target_user_id)
          or (fr.receiver_id = auth.uid() and fr.sender_id = target_user_id))
    );
$$;
revoke all on function public.get_connected_whatsapp(uuid) from public;
grant execute on function public.get_connected_whatsapp(uuid) to authenticated;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles
  for select using (true);
drop view if exists public.public_profiles;

alter table public.communities enable row level security;
drop policy if exists "Owners update communities" on public.communities;
create policy "Owners update communities" on public.communities
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

notify pgrst, 'reload schema';
