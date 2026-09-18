import { admin, AMOUNT, CURRENCY, PLAN_CODE, authenticatedUser, json, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  try {
    const user = await authenticatedUser(req);
    const { data: existing } = await admin.from("verification_subscriptions").select("id").eq("user_id", user.id).in("status", ["pending", "active"]).maybeSingle();
    if (existing) return json({ error: "An active or pending subscription already exists." }, 409);
    const data = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: user.email, amount: AMOUNT, currency: CURRENCY, plan: PLAN_CODE, metadata: { user_id: user.id } }) });
    await admin.from("verification_subscriptions").insert({ user_id: user.id, paystack_plan_code: PLAN_CODE, status: "pending", amount: AMOUNT, currency: CURRENCY });
    return json({ access_code: data.access_code, reference: data.reference });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unable to initialize verification payment." }, 500);
  }
});
