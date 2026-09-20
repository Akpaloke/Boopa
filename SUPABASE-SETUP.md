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
PAYSTACK_PLAN_CODE=PLN_qqy4dlftp0esmsr
```

Configure Paystack's webhook URL as:

```text
https://boopa-con.vercel.app/api/payments/paystack-webhook
```
