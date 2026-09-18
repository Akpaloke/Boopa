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

Apply all migrations in `supabase/migrations` before deploying, including `202609181430_profiles_consistency.sql`. That migration standardizes legacy profile fields to `full_name`, `university`, `department`, and text levels `100` through `500` without deleting profile rows, then requests a PostgREST schema reload. The frontend reads profiles, communities, and posts from Supabase.
