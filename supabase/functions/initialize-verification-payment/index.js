import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AMOUNT = 20000;
const CURRENCY = "NGN";
const PLAN_CODE = "PLN_wr6p28z1zstqalb";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

async function getAuthenticatedUser(request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: "Bearer " + token } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  console.log("PAYSTACK_FUNCTION_REACHED");

  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorized();
    console.log("PAYSTACK_AUTH_OK");

    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const configuredPlan = Deno.env.get("PAYSTACK_PLAN_CODE") || PLAN_CODE;
    console.log("PAYSTACK_SECRET_PRESENT", Boolean(secret));
    if (!secret || configuredPlan !== PLAN_CODE) {
      return json({ error: "Payment service is not configured correctly." }, 500);
    }
    if (!user.email) {
      return json({ error: "Your account does not have an email address for payment." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const { data: existing, error: existingError } = await admin
      .from("verification_subscriptions")
      .select("id,status,next_payment_date")
      .eq("user_id", user.id)
      .in("status", ["pending", "active"])
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing
      && existing.status === "active"
      && existing.next_payment_date
      && new Date(existing.next_payment_date).getTime() > Date.now()) {
      return json({ error: "An active subscription already exists." }, 409);
    }

    console.log("PAYSTACK_REQUEST_STARTED");
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + secret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: AMOUNT,
          currency: CURRENCY,
          plan: configuredPlan,
          metadata: { user_id: user.id, verification_type: "profile" },
        }),
      },
    );
    const result = await paystackResponse.json().catch(() => ({}));
    console.log("PAYSTACK_RESPONSE_STATUS", paystackResponse.status);
    if (!paystackResponse.ok || !result.status) {
      return json(
        { error: result.message || "Paystack could not initialize payment." },
        502,
      );
    }

    const checkout = result.data;
    if (!checkout?.authorization_url || !checkout?.access_code || !checkout?.reference) {
      return json({ error: "Paystack did not return a valid checkout response." }, 502);
    }
    console.log("PAYSTACK_AUTHORIZATION_URL_RECEIVED");

    const { error: insertError } = await admin
      .from("verification_subscriptions")
      .insert({
        user_id: user.id,
        paystack_reference: checkout.reference,
        paystack_plan_code: configuredPlan,
        status: "pending",
        amount: AMOUNT,
        currency: CURRENCY,
      });
    if (insertError) throw insertError;

    return json({
      success: true,
      access_code: checkout.access_code,
      authorization_url: checkout.authorization_url,
      reference: checkout.reference,
    });
  } catch (error) {
    console.error(
      "PAYSTACK_FUNCTION_ERROR",
      error instanceof Error ? error.message : "unknown error",
    );
    return json(
      { error: error instanceof Error ? error.message : "Unable to initialize verification payment." },
      500,
    );
  }
});
