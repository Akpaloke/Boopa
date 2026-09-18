# Boopa verification deployment

Deploy the functions with the Supabase CLI:

```sh
supabase functions deploy verification-initialize
supabase functions deploy verification-confirm
supabase functions deploy verification-status
supabase functions deploy verification-cancel
supabase functions deploy paystack-webhook
supabase functions deploy community-verification-initialize
```

Apply every migration in `supabase/migrations`, including `202609181430_profiles_consistency.sql`, before testing signup. It standardizes profile fields and requests a PostgREST schema-cache reload.

Set these server-side secrets only. `PAYSTACK_PLAN_CODE` is required by the Edge Functions as well:

```sh
supabase secrets set PAYSTACK_SECRET_KEY=... SUPABASE_SERVICE_ROLE_KEY=... PAYSTACK_PLAN_CODE=PLN_qqy4dlftp0esmsr
```

Configure the Paystack webhook URL as:

`https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/paystack-webhook`

The static frontend expects deployment-injected `window.BOOPA_CONFIG` values for the Supabase URL, publishable key, Paystack public key, and Paystack plan code. Do not put the secret key or service-role key in this file, frontend environment variables, or browser code.
