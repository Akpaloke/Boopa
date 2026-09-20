const {
  AMOUNT, CURRENCY, PLAN_CODE, json, supabaseUser, supabaseRest,
  paystack, requirePaymentConfig, safeError, logPaystackEnvironment,
} = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
  try {
    logPaystackEnvironment("verify-verification");
    requirePaymentConfig();
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Please log in again to verify your payment." });
    const reference = typeof req.query.reference === "string" ? req.query.reference.trim() : "";
    if (!reference) return json(res, 400, { error: "A payment reference is required." });

    const transaction = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    const metadata = transaction?.metadata || {};
    const transactionPlan = transaction?.plan?.plan_code || transaction?.plan;
    if (
      transaction?.status !== "success"
      || Number(transaction.amount) !== AMOUNT
      || transaction.currency !== CURRENCY
      || transactionPlan !== PLAN_CODE
      || metadata.user_id !== user.id
    ) {
      return json(res, 400, { error: "Payment could not be matched to this account or verification plan." });
    }

    const subscriptions = await supabaseRest(
      `verification_subscriptions?select=id&user_id=eq.${encodeURIComponent(user.id)}&paystack_reference=eq.${encodeURIComponent(reference)}&limit=1`,
    );
    if (!subscriptions.length) return json(res, 400, { error: "No pending verification payment was found." });

    const startedAt = new Date();
    const nextPaymentDate = new Date(startedAt);
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    await supabaseRest(`verification_subscriptions?id=eq.${encodeURIComponent(subscriptions[0].id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "active",
        started_at: startedAt.toISOString(),
        next_payment_date: nextPaymentDate.toISOString(),
        paystack_customer_code: transaction.customer?.customer_code || null,
      }),
    });
    await supabaseRest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_verified: true, verification_status: "active" }),
    });
    return json(res, 200, { status: "active", verified: true });
  } catch (error) {
    console.error("PAYSTACK_VERIFICATION_FAILED", safeError(error));
    return json(res, error.status >= 400 && error.status < 600 ? error.status : 500, {
      error: safeError(error),
    });
  }
};
