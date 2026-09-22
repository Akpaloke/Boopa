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

The browser registers `/service-worker.js` only after the user chooses
**Enable phone notifications** and `pushVapidPublicKey` is configured.
Set the VAPID public key in `config.js` (it is safe to expose); keep the
private key only in Supabase Edge Function secrets:

```text
VAPID_SUBJECT=mailto:admin@boopa.app
VAPID_PUBLIC_KEY=<same public key as config.js>
VAPID_PRIVATE_KEY=<server-only private key>
PUSH_WEBHOOK_SECRET=<server-only random value>
```

Generate a key pair once if you do not already have one:

```sh
npx web-push generate-vapid-keys
```

Deploy `supabase/functions/push-notification` with JWT verification disabled,
then create a Supabase Database
Webhook for `public.notifications` INSERT events pointing to that function with
the `x-push-webhook-secret` header. This webhook is required: Realtime updates
the open Boopa app, while the webhook sends a Web Push notification to the
phone when the app is backgrounded or closed. Configure it in Supabase
Dashboard → Database → Webhooks:

* Table: `public.notifications`
* Events: `INSERT`
* URL: `https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/push-notification`
* Header: `x-push-webhook-secret: <the exact PUSH_WEBHOOK_SECRET>`

When using the CLI, deploy it with:

```sh
supabase functions deploy push-notification --no-verify-jwt
```

The function still rejects every request without the matching
`x-push-webhook-secret`; disabling the platform JWT check is only for allowing
the Database Webhook to invoke it.

The `202609201800_push_notifications.sql` migration creates the private
subscription table and RLS policies.

Also apply `202609201900_push_presence.sql` so the push function can suppress
message pushes while the recipient is actively viewing that exact chat.

For Vercel, add only the browser-safe value:

```text
PUSH_VAPID_PUBLIC_KEY=BGSSSuv5NQ6LbtGcwWfO-aIMyLv-9M-r2id_JzbrprkrwrQQFGFQ_vHn7vD_hfvJcg6LFS_V16CHX3QKwiUh-ps
```

The deployed `config.js` must expose that value as `pushVapidPublicKey`. Keep
`VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `PUSH_WEBHOOK_SECRET` in
Supabase Edge Function secrets, never in Vercel frontend variables or browser
JavaScript. The Database Webhook should send notification inserts to the
deployed `push-notification` function.

The static deployment must inject `PUSH_VAPID_PUBLIC_KEY` into `config.js`;
adding it to Vercel alone does not automatically expose it to this static
HTML app.

```sh
supabase functions deploy push-notification --no-verify-jwt
supabase secrets set VAPID_SUBJECT=mailto:admin@boopa.app VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... PUSH_WEBHOOK_SECRET=...
```

After deployment, each user must enable **Phone notifications** once from
their Boopa profile. The browser permission prompt is required by Android and
iOS; on iPhone, Boopa must be installed to the Home Screen for Web Push to
appear as a normal phone notification. The subscription is stored per user
and device in `public.push_subscriptions`, and revoked subscriptions are
removed automatically when a phone reports them as expired.

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
