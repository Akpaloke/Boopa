-- Expose profile data without exposing WhatsApp numbers through normal SELECTs.
drop view if exists public.public_profiles;
create view public.public_profiles as
select id, full_name, university, department, level, avatar_url, bio,
       is_verified, verification_status, created_at, updated_at
from public.profiles;

grant select on public.public_profiles to authenticated;

revoke select (number) on public.profiles from anon, authenticated;

create or replace function public.get_profile_for_view(target_user_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  university text,
  department text,
  level text,
  avatar_url text,
  bio text,
  is_verified boolean,
  verification_status text,
  number text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name,
    case when p.id = auth.uid() then p.email else null end,
    p.university, p.department, p.level, p.avatar_url, p.bio,
    p.is_verified, p.verification_status,
    case
      when p.id = auth.uid()
        or exists (
          select 1
          from public.friend_requests fr
          where fr.status = 'accepted'
            and ((fr.sender_id = auth.uid() and fr.receiver_id = p.id)
              or (fr.receiver_id = auth.uid() and fr.sender_id = p.id))
        )
      then p.number
      else null
    end,
    p.created_at, p.updated_at
  from public.profiles p
  where p.id = target_user_id;
$$;

revoke all on function public.get_profile_for_view(uuid) from public;
grant execute on function public.get_profile_for_view(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end
$$;

alter table public.notifications replica identity full;
