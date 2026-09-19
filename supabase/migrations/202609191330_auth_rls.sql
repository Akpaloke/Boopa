-- Keep profile RLS enabled while allowing each authenticated user to manage
-- only the profile whose id matches their Auth user id.
alter table public.profiles enable row level security;

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

notify pgrst, 'reload schema';
