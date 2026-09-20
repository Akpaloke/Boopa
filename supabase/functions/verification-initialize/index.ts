import { admin, AMOUNT, CURRENCY, PLAN_CODE, authenticatedUser, json, options, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  console.log("EDGE_FUNCTION_REACHED", { function: "verification-initialize", method: req.method });
  if (req.method === "OPTIONS") return options();
  try {
    const user = await authenticatedUser(req);
    const { data: existing } = await admin.from("verification_subscriptions").select("id,status,next_payment_date").eq("user_id", user.id).eq("status", "active");
    if (existing?.some((subscription) => subscription.next_payment_date && new Date(subscription.next_payment_date).getTime() > Date.now())) {
      return json({ error: "An active subscription already exists." }, 409);
    }
    if (!user.email) return json({ error: "Your account does not have an email address for payment." }, 400);
    const data = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: user.email, amount: AMOUNT, currency: CURRENCY, plan: PLAN_CODE, metadata: { user_id: user.id, verification_type: "profile" } }) });
    if (!data?.authorization_url || !data?.access_code || !data?.reference) return json({ error: "Paystack did not return a valid checkout response." }, 502);
    console.log("AUTHORIZATION_URL_RECEIVED", { has_authorization_url: true, has_reference: true });
    const { error: insertError } = await admin.from("verification_subscriptions").insert({ user_id: user.id, paystack_reference: data.reference, paystack_plan_code: PLAN_CODE, status: "pending", amount: AMOUNT, currency: CURRENCY });
    if (insertError) throw insertError;
    return json({ access_code: data.access_code, authorization_url: data.authorization_url, reference: data.reference });
  } catch (error) {
    console.error("Verification initialization failed:", error instanceof Error ? error.message : "unknown error");
    if (error instanceof Response) return error;
    return json({ error: "Unable to initialize verification payment." }, 500);
  }
});
