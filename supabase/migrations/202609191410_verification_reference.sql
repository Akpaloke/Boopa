alter table public.verification_subscriptions
  add column if not exists paystack_reference text;

create unique index if not exists verification_paystack_reference_idx
  on public.verification_subscriptions(paystack_reference)
  where paystack_reference is not null;

notify pgrst, 'reload schema';
