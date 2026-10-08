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

Boopa now uses native browser Web Push with VAPID instead of OneSignal.
The app registers its own service worker, subscribes through the browser Push API,
and stores each device subscription in `public.push_subscriptions`.

### Browser-side registration

The browser registers `/service-worker.js` only after the user chooses
**Enable Notifications** and the page has a valid browser-safe VAPID public key.
The public key is safe to expose in `config.js`; keep the private key only in the
Supabase Edge Function environment (server-side only).

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

### Database and webhook setup

The `202609201800_push_notifications.sql` migration creates the private
subscription table and RLS policies. It includes the `public.push_subscriptions`
table, a unique index on `endpoint`, and user-scoped row-level security.

Configure the notification database webhook in Supabase Dashboard → Integrations →
Webhooks:

* Table: `public.notifications`
* Events: `INSERT`
* URL: `https://<project-ref>.supabase.co/functions/v1/push-notification`
* Header: `x-push-webhook-secret: <the exact PUSH_WEBHOOK_SECRET>`

This webhook is responsible for fetching each user's subscriptions and sending
Web Push messages using the VAPID private key.

### Frontend deployment values

For a static deployment, inject the browser-safe VAPID public key into `config.js`:

```text
PUSH_VAPID_PUBLIC_KEY=BDxaYUK2R-LRBNIbHLW26kXVlJ92VkfBuSTFpDqTGWS3ShuLxpqv9tVChNCov_ayk8weNrneoSx0BvFd4kcUsiI
```

Keep `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `PUSH_WEBHOOK_SECRET`
in Supabase Edge Function secrets and never expose them in browser JavaScript or
a frontend config file.

### User experience

After deployment, each user must enable **Enable Notifications** once from the
Boopa profile screen. Browsers require the permission prompt to be triggered by
user interaction. On iPhone, Boopa should be installed to the Home Screen for
Web Push to appear like a normal phone notification.

The browser subscription is stored per user and device in
`public.push_subscriptions`, and invalid/expired subscriptions are removed
automatically when delivery fails.

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
