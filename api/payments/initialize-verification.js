const {
  AMOUNT, CURRENCY, PLAN_CODE, json, supabaseUser, supabaseRest,
  paystack, requirePaymentConfig, safeError, logPaystackEnvironment,
} = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  logPaystackEnvironment("initialize-verification");
  console.log("PAYSTACK_INITIALIZATION_STARTED");
  try {
    requirePaymentConfig();
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Please log in again before subscribing." });
    console.log("SUPABASE_AUTH_VERIFIED");
    if (!user.email) return json(res, 400, { error: "Your account does not have an email address for payment." });

    const existing = await supabaseRest(
      `verification_subscriptions?select=id&user_id=eq.${encodeURIComponent(user.id)}&status=in.(pending,active)&limit=1`,
    );
    if (existing.length) return json(res, 409, { error: "An active or pending subscription already exists." });

    console.log("PAYSTACK_REQUEST_SENT");
    const checkout = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: AMOUNT,
        currency: CURRENCY,
        plan: PLAN_CODE,
        metadata: { user_id: user.id, verification_type: "profile" },
      }),
    });
    console.log("PAYSTACK_RESPONSE_RECEIVED");
    if (!checkout?.authorization_url || !checkout?.reference) {
      return json(res, 502, { error: "Paystack did not return a valid checkout response." });
    }

    await supabaseRest("verification_subscriptions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: user.id,
        paystack_reference: checkout.reference,
        paystack_plan_code: PLAN_CODE,
        status: "pending",
        amount: AMOUNT,
        currency: CURRENCY,
      }),
    });
    console.log("PAYSTACK_INITIALIZATION_SUCCESS");
    return json(res, 200, {
      authorization_url: checkout.authorization_url,
      access_code: checkout.access_code,
      reference: checkout.reference,
    });
  } catch (error) {
    console.error("PAYSTACK_INITIALIZATION_FAILED", safeError(error));
    return json(res, error.status >= 400 && error.status < 600 ? error.status : 500, {
      error: safeError(error),
    });
  }
};
