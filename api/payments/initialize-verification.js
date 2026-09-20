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
      `verification_subscriptions?select=id,status,paystack_reference,created_at,next_payment_date&user_id=eq.${encodeURIComponent(user.id)}&status=in.(pending,active)&order=created_at.desc`,
    );
    const now = Date.now();
    const blockingActive = existing.filter((subscription) =>
      subscription.status === "active"
      && subscription.next_payment_date
      && new Date(subscription.next_payment_date).getTime() > now
    );
    if (blockingActive.length) {
      return json(res, 409, { error: "An active subscription already exists." });
    }
    const pending = existing.filter((subscription) => subscription.status === "pending");
    for (const subscription of pending) {
      const createdAt = new Date(subscription.created_at).getTime();
      const expired = !createdAt || now - createdAt > 30 * 60 * 1000;
      if (!expired && subscription.paystack_reference) {
        try {
          const transaction = await paystack(`/transaction/verify/${encodeURIComponent(subscription.paystack_reference)}`);
          const metadata = transaction?.metadata || {};
          const transactionPlan = transaction?.plan?.plan_code || transaction?.plan;
          if (
            transaction?.status === "success"
            && Number(transaction.amount) === AMOUNT
            && transaction.currency === CURRENCY
            && transactionPlan === PLAN_CODE
            && metadata.user_id === user.id
          ) {
            const startedAt = new Date();
            const nextPaymentDate = new Date(startedAt);
            nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
            await supabaseRest(`verification_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, {
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
            return json(res, 200, { already_verified: true, status: "active" });
          }
        } catch (error) {
          console.error("PENDING_PAYMENT_VERIFY_FAILED", safeError(error));
          if (!error || ![400, 404].includes(error.status)) throw error;
        }
      }
      await supabaseRest(`verification_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString() }),
      });
    }
    const reference = `boopa_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log("PAYSTACK_REQUEST_SENT");
    const checkout = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: AMOUNT,
        currency: CURRENCY,
        plan: PLAN_CODE,
        reference,
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
        paystack_authorization_url: checkout.authorization_url,
        paystack_access_code: checkout.access_code,
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
