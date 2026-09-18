-- Make signup profile creation work even when Supabase email confirmation
-- means the browser receives no authenticated session.

alter table public.profiles alter column level type integer using nullif(regexp_replace(trim(level::text), '\s*Level\s*$', ''), '')::integer;
alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles add constraint profiles_level_check check (level is null or level in (100, 200, 300, 400, 500));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_level integer;
begin
  requested_level := nullif(new.raw_user_meta_data ->> 'level', '')::integer;

  insert into public.profiles (
    id, full_name, email, university, department, level, number, avatar_url, bio
  ) values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'university', ''),
    nullif(new.raw_user_meta_data ->> 'department', ''),
    requested_level,
    nullif(new.raw_user_meta_data ->> 'number', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    ''
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    university = excluded.university,
    department = excluded.department,
    level = excluded.level,
    number = excluded.number,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

notify pgrst, 'reload schema';
