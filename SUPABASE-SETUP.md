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

### OneSignal delivery

OneSignal delivers closed-app notifications. The frontend uses the OneSignal
Web Push App ID and associates the signed-in Supabase user ID as the OneSignal
external ID. Never expose the OneSignal REST API key in frontend code.

Deploy `supabase/functions/boopa-onesignal` with:

```sh
supabase functions deploy boopa-onesignal --no-verify-jwt
supabase secrets set ONESIGNAL_APP_ID=<your OneSignal App ID> ONESIGNAL_REST_API_KEY=<server-only REST API key> PUSH_WEBHOOK_SECRET=<webhook secret>
```

Point the single `public.notifications` INSERT webhook to:

`https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/boopa-onesignal`

Use the same `x-push-webhook-secret` header configured in the function secrets.

Do not point this webhook at `boopa-notifications` or `push-notification`.
Those are legacy custom Web Push senders; using multiple senders can create
duplicate notifications or fail when their separate VAPID secrets are absent.

The OneSignal worker is registered separately from Boopa's legacy
`/service-worker.js`. Users must grant the native browser notification
permission before OneSignal can deliver phone notifications.

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

The database webhook is required: Realtime updates the open Boopa app, while
the `boopa-onesignal` webhook sends a phone notification when the app is
backgrounded or closed. Configure it in Supabase Dashboard → Integrations →
Webhooks:

* Table: `public.notifications`
* Events: `INSERT`
* URL: `https://uhjezsadlbtrapiyzqrt.supabase.co/functions/v1/boopa-onesignal`
* Header: `x-push-webhook-secret: <the exact PUSH_WEBHOOK_SECRET>`

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
JavaScript. The VAPID values are only needed if you intentionally use the
legacy custom Web Push sender; they are not needed for the OneSignal path.

The static deployment must inject `PUSH_VAPID_PUBLIC_KEY` into `config.js`;
adding it to Vercel alone does not automatically expose it to this static
HTML app.

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
