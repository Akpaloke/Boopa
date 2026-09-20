# Boopa production setup

This project is a static React document, not a Vite or Next.js app. Frontend configuration is injected through `config.js`; `.env.local` is a local deployment reference and is intentionally ignored by Git.

Set the frontend-safe values in the generated deployment file:

```js
window.BOOPA_CONFIG = {
  supabaseUrl: "https://uhjezsadlbtrapiyzqrt.supabase.co",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY,
  paystackPlanCode: process.env.PAYSTACK_PLAN_CODE
};
```

The local variable names and deployment placeholders are documented in `.env.example`. Never place `PAYSTACK_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in `config.js`, HTML, frontend environment variables, or browser code.

Apply all migrations in `supabase/migrations`, including `202609200935_avatar_storage.sql` and `202609201132_friend_avatar_policies.sql`. These ensure the public `avatars` bucket exists, restrict avatar operations to the owner's user-id path, and limit friend-request updates to the receiving user.

## Web Push notifications

The browser registers `/sw.js` only when `pushVapidPublicKey` is configured.
Set the VAPID public key in `config.js` (it is safe to expose); keep the
private key only in Supabase Edge Function secrets:

```text
PUSH_VAPID_SUBJECT=mailto:admin@boopa.app
PUSH_VAPID_PUBLIC_KEY=<same public key as config.js>
PUSH_VAPID_PRIVATE_KEY=<server-only private key>
PUSH_WEBHOOK_SECRET=<server-only random value>
```

Deploy `supabase/functions/push-notification`, then create a Supabase Database
Webhook for `public.notifications` INSERT events pointing to that function with
the `x-push-webhook-secret` header. The `202609201800_push_notifications.sql`
migration creates the private subscription table and RLS policies.

## Paystack backend

Verification payments are handled by the Vercel Node.js API routes, not by a
Supabase Edge Function:

```text
POST /api/payments/initialize-verification
GET  /api/payments/verify-verification?reference=...
GET  /api/payments/status
POST /api/payments/cancel
POST /api/payments/paystack-webhook
```

Set these as server-only Vercel environment variables:

```text
SUPABASE_URL=https://uhjezsadlbtrapiyzqrt.supabase.co
SUPABASE_PUBLISHABLE_KEY=<existing publishable key>
SUPABASE_SERVICE_ROLE_KEY=<server-only Supabase service role key>
PAYSTACK_SECRET_KEY=<server-only Paystack secret key>
PAYSTACK_PLAN_CODE=PLN_wr6p28z1zstqalb
```

`SUPABASE_PUBLISHABLE_KEY` must be configured in the Vercel Production
environment with the same public key used by `config.js`. The production
backend reads the exact names `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, and `PAYSTACK_PLAN_CODE`.
After changing any Vercel variable, create a new production deployment.

Configure Paystack's webhook URL as:

```text
https://boopa-con.vercel.app/api/payments/paystack-webhook
```
