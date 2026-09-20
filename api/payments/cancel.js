const { json, supabaseUser, supabaseRest, paystack, requirePaymentConfig, safeError, logPaystackEnvironment } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  try {
    logPaystackEnvironment("cancel");
    requirePaymentConfig();
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const requestedReference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
    const referenceFilter = requestedReference ? `&paystack_reference=eq.${encodeURIComponent(requestedReference)}` : "";
    const rows = await supabaseRest(`verification_subscriptions?select=id,status,paystack_subscription_code,paystack_email_token&user_id=eq.${encodeURIComponent(user.id)}&status=in.(active,pending)&order=created_at.desc${referenceFilter}`);
    if (!rows.length) return json(res, 404, { error: "No active verification subscription was found." });
    const paystackSubscription = rows.find((row) => row.status === "active") || rows[0];
    if (paystackSubscription.paystack_subscription_code && paystackSubscription.paystack_email_token) {
      await paystack("/subscription/disable", {
        method: "POST",
        body: JSON.stringify({
          code: paystackSubscription.paystack_subscription_code,
          token: paystackSubscription.paystack_email_token,
        }),
      });
    }
    const cancelledAt = new Date().toISOString();
    for (const row of rows) {
      await supabaseRest(`verification_subscriptions?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "cancelled", cancelled_at: cancelledAt }),
      });
    }
    await supabaseRest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_verified: false, verification_status: "cancelled" }),
    });
    return json(res, 200, { status: "cancelled" });
  } catch (error) {
    console.error("PAYSTACK_CANCELLATION_FAILED", safeError(error));
    return json(res, 500, { error: safeError(error) });
  }
};
