# Boopa verification deployment

Deploy the functions with the Supabase CLI:

```sh
supabase functions deploy initialize-verification-payment
supabase functions deploy verification-confirm
supabase functions deploy verification-status
supabase functions deploy verification-cancel
supabase functions deploy paystack-webhook
supabase functions deploy community-verification-initialize
supabase functions deploy push-notification
```

The frontend calls `initialize-verification-payment`. The older
`verification-initialize` function is not used by the current frontend.
Deploy from the project root to the Supabase project whose URL is
`https://uhjezsadlbtrapiyzqrt.supabase.co`, then verify that this endpoint no
longer returns 404:

```text
https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/initialize-verification-payment
```

If the Supabase CLI is unavailable, deploy the same
`supabase/functions/initialize-verification-payment/index.js` file through the
Supabase Dashboard under Edge Functions. The SQL Editor script does not deploy
Edge Functions.

Apply every migration in `supabase/migrations`, including `202609181430_profiles_consistency.sql` and `202609181500_signup_profile_trigger.sql`, before testing signup. The signup migration standardizes profile fields, validates integer levels from 100 through 500, creates the Auth-to-profile trigger, and requests a PostgREST schema-cache reload.

Set these server-side secrets only. `PAYSTACK_PLAN_CODE` is required by the Edge Functions as well:

```sh
supabase secrets set PAYSTACK_SECRET_KEY=... SUPABASE_SERVICE_ROLE_KEY=... PAYSTACK_PLAN_CODE=PLN_wr6p28z1zstqalb
```

Configure the Paystack webhook URL as:

`https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/paystack-webhook`

The static frontend expects deployment-injected `window.BOOPA_CONFIG` values for the Supabase URL, publishable key, Paystack public key, and Paystack plan code. Do not put the secret key or service-role key in this file, frontend environment variables, or browser code.
