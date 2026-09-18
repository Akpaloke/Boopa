-- Standardize profile fields without deleting existing user data.
-- Apply this migration in Supabase, then reload the PostgREST schema cache.

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Copy legacy values before removing duplicate legacy columns. Dynamic SQL keeps
-- this migration valid when a legacy column was never present.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'name') then
    execute 'update public.profiles set full_name = coalesce(nullif(full_name, ''''), name)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'uni') then
    execute 'update public.profiles set university = coalesce(nullif(university, ''''), uni)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'dept') then
    execute 'update public.profiles set department = coalesce(nullif(department, ''''), dept)';
  end if;
end $$;

-- Rename legacy columns when no standardized column existed, otherwise remove only
-- after copying their data above. No profile rows are deleted.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'name') then
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'full_name') then
      alter table public.profiles rename column name to full_name;
    else
      alter table public.profiles drop column name;
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'uni') then
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'university') then
      alter table public.profiles rename column uni to university;
    else
      alter table public.profiles drop column uni;
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'dept') then
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'department') then
      alter table public.profiles rename column dept to department;
    else
      alter table public.profiles drop column dept;
    end if;
  end if;
end $$;

-- Store levels as text values 100 through 500 and normalize older "100 Level" rows.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'level') then
    if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'level') <> 'text' then
      alter table public.profiles alter column level type text using level::text;
    end if;
  else
    alter table public.profiles add column level text;
  end if;
end $$;

update public.profiles
set level = regexp_replace(trim(level), '\s*Level\s*$', '')
where level is not null;

alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles add constraint profiles_level_check check (level is null or level in ('100', '200', '300', '400', '500'));

create index if not exists profiles_university_idx on public.profiles (university);
create index if not exists profiles_department_idx on public.profiles (department);

alter table public.profiles enable row level security;
drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile" on public.profiles
  for insert with check (auth.uid() = id);

notify pgrst, 'reload schema';
