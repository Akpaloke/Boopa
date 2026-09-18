create table if not exists public.verification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paystack_customer_code text,
  paystack_subscription_code text unique,
  paystack_email_token text,
  paystack_plan_code text not null,
  status text not null check (status in ('pending','active','cancelled','failed','expired','inactive')),
  amount integer not null,
  currency text not null default 'NGN',
  started_at timestamptz,
  next_payment_date timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists verification_one_current_subscription
  on public.verification_subscriptions(user_id)
  where status in ('pending','active');

alter table public.verification_subscriptions enable row level security;
create policy "Users can read their own verification subscription"
  on public.verification_subscriptions for select
  using (auth.uid() = user_id);

alter table public.profiles add column if not exists verification_status text not null default 'inactive';
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles enable row level security;
create policy "Users can read their own verification fields"
  on public.profiles for select
  using (auth.uid() = id);

create or replace function public.prevent_client_verification_changes()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.role() = 'authenticated' and
     (new.is_verified is distinct from old.is_verified or
      new.verification_status is distinct from old.verification_status) then
    raise exception 'Verification status is managed by the payment backend';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_verification on public.profiles;
create trigger protect_profile_verification
before update on public.profiles
for each row execute function public.prevent_client_verification_changes();
