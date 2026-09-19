import { admin, AMOUNT, CURRENCY, PLAN_CODE, authenticatedUser, json, options, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  try {
    const user = await authenticatedUser(req);
    const { data: existing } = await admin.from("verification_subscriptions").select("id").eq("user_id", user.id).in("status", ["pending", "active"]).maybeSingle();
    if (existing) return json({ error: "An active or pending subscription already exists." }, 409);
    const data = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: user.email, amount: AMOUNT, currency: CURRENCY, plan: PLAN_CODE, metadata: { user_id: user.id } }) });
    const { error: insertError } = await admin.from("verification_subscriptions").insert({ user_id: user.id, paystack_plan_code: PLAN_CODE, status: "pending", amount: AMOUNT, currency: CURRENCY });
    if (insertError) throw insertError;
    return json({ access_code: data.access_code, authorization_url: data.authorization_url, reference: data.reference });
  } catch (error) {
    console.error("Verification initialization failed:", error instanceof Error ? error.message : "unknown error");
    if (error instanceof Response) return error;
    return json({ error: "Unable to initialize verification payment." }, 500);
  }
});
