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

Set these server-side secrets only:

```sh
supabase secrets set PAYSTACK_SECRET_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
```

Configure the Paystack webhook URL as:

`https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/paystack-webhook`

The static frontend expects a deployment-injected `window.BOOPA_CONFIG.paystackPublicKey` containing the Paystack public key. Do not put the secret key in this file, in frontend environment variables, or in browser code.
