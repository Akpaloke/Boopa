import { admin, AMOUNT, CURRENCY, authenticatedUser, json, options, paystack } from "../_shared/paystack.ts";

const FUNCTION_NAME = "initialize-verification-payment";

Deno.serve(async (req) => {
  console.log("EDGE_FUNCTION_REACHED", { function: FUNCTION_NAME, method: req.method });
  if (req.method === "OPTIONS") return options();

  try {
    const user = await authenticatedUser(req);
    const planCode = Deno.env.get("PAYSTACK_PLAN_CODE");
    if (!planCode) return json({ error: "PAYSTACK_PLAN_CODE is not configured." }, 500);
    if (!user.email) return json({ error: "Your account does not have an email address for payment." }, 400);

    const { data: existing } = await admin
      .from("verification_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "active"])
      .maybeSingle();
    if (existing) return json({ error: "An active or pending subscription already exists." }, 409);

    const data = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: AMOUNT,
        currency: CURRENCY,
        plan: planCode,
        metadata: { user_id: user.id, verification_type: "profile" },
      }),
    });
    if (!data?.authorization_url || !data?.access_code || !data?.reference) {
      return json({ error: "Paystack did not return a valid checkout response." }, 502);
    }

    const { error: insertError } = await admin.from("verification_subscriptions").insert({
      user_id: user.id,
      paystack_reference: data.reference,
      paystack_plan_code: planCode,
      status: "pending",
      amount: AMOUNT,
      currency: CURRENCY,
    });
    if (insertError) throw insertError;

    return json({
      success: true,
      access_code: data.access_code,
      authorization_url: data.authorization_url,
      reference: data.reference,
    });
  } catch (error) {
    console.error(`${FUNCTION_NAME} failed:`, error instanceof Error ? error.message : "unknown error");
    if (error instanceof Response) return error;
    return json({ error: error instanceof Error ? error.message : "Unable to initialize verification payment." }, 500);
  }
});
