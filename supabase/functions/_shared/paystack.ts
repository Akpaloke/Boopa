import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLAN_CODE = "PLN_qqy4dlftp0esmsr";
export const AMOUNT = 20000;
export const CURRENCY = "NGN";
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export async function authenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  console.log("AUTH_CHECK", { token_present: Boolean(token) });
  if (!token) throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await client.auth.getUser();
  console.log("AUTH_CHECK", { authenticated: Boolean(data.user), error: error?.message || null });
  if (error || !data.user) throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
  return data.user;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export function options() {
  return new Response("ok", { headers: CORS_HEADERS });
}

export async function paystack(path: string, init: RequestInit = {}) {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  console.log("PAYSTACK_SECRET_PRESENT", Boolean(secret));
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  console.log("PAYSTACK_REQUEST_STARTED", { path });
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  console.log("PAYSTACK_RESPONSE_STATUS", response.status);
  console.log("PAYSTACK_RESPONSE_BODY", body);
  if (!response.ok || !body.status) throw new Error(body.message || "Paystack request failed");
  return body.data;
}
