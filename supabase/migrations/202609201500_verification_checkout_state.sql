alter table public.verification_subscriptions
  add column if not exists paystack_authorization_url text,
  add column if not exists paystack_access_code text;

create unique index if not exists verification_paystack_reference_unique
  on public.verification_subscriptions(paystack_reference)
  where paystack_reference is not null;

drop index if exists public.verification_one_current_subscription;

create unique index if not exists verification_one_active_per_user
  on public.verification_subscriptions(user_id)
  where status = 'active';

-- Cleanup for abandoned checkout attempts. This preserves history.
-- update public.verification_subscriptions
-- set status = 'cancelled', cancelled_at = now()
-- where status = 'pending';
