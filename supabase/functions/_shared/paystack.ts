import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLAN_CODE = "PLN_qqy4dlftp0esmsr";
export const AMOUNT = 20000;
export const CURRENCY = "NGN";

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export async function authenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  return data.user;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function paystack(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await response.json();
  if (!response.ok || !body.status) throw new Error(body.message || "Paystack request failed");
  return body.data;
}
