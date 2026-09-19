-- Keep notifications compatible with databases created before actor_id existed.
alter table public.notifications
  add column if not exists actor_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_actor_id_fkey'
  ) then
    alter table public.notifications
      add constraint notifications_actor_id_fkey
      foreign key (actor_id) references public.profiles(id) on delete set null;
  end if;
end
$$;

create index if not exists notifications_actor_id_idx
  on public.notifications(actor_id);

notify pgrst, 'reload schema';
