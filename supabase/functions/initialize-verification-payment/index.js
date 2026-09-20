import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AMOUNT = 20000;
const CURRENCY = "NGN";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

const getUser = async (req) => {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  const client = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  return data.user;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  console.log("PAYSTACK_FUNCTION_REACHED");
  try {
    const user = await getUser(req);
    console.log("PAYSTACK_AUTH_OK");
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const planCode = Deno.env.get("PAYSTACK_PLAN_CODE");
    console.log("PAYSTACK_SECRET_PRESENT", Boolean(secret));
    if (!secret || !planCode) return json({ error: "Payment service is not configured." }, 500);
    if (!user.email) return json({ error: "Your account does not have an email address for payment." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: existing, error: existingError } = await admin.from("verification_subscriptions")
      .select("id").eq("user_id", user.id).in("status", ["pending", "active"]).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return json({ error: "An active or pending subscription already exists." }, 409);

    console.log("PAYSTACK_REQUEST_STARTED");
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: AMOUNT,
        currency: CURRENCY,
        plan: planCode,
        metadata: { user_id: user.id, verification_type: "profile" },
      }),
    });
    const result = await paystackResponse.json().catch(() => ({}));
    console.log("PAYSTACK_RESPONSE_STATUS", paystackResponse.status);
    if (!paystackResponse.ok || !result.status) return json({ error: result.message || "Paystack could not initialize payment." }, 502);
    const data = result.data;
    if (!data?.authorization_url || !data?.access_code || !data?.reference) return json({ error: "Paystack did not return a valid checkout response." }, 502);
    console.log("PAYSTACK_AUTHORIZATION_URL_RECEIVED");

    const { error: insertError } = await admin.from("verification_subscriptions").insert({
      user_id: user.id, paystack_reference: data.reference, paystack_plan_code: planCode,
      status: "pending", amount: AMOUNT, currency: CURRENCY,
    });
    if (insertError) throw insertError;
    return json({ success: true, access_code: data.access_code, authorization_url: data.authorization_url, reference: data.reference });
  } catch (error) {
    console.error("PAYSTACK_FUNCTION_ERROR", error instanceof Error ? error.message : "unknown error");
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "Unable to initialize verification payment." }, 500);
  }
});
