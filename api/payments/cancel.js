const { json, supabaseUser, supabaseRest, paystack, requirePaymentConfig, safeError, logPaystackEnvironment } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  try {
    logPaystackEnvironment("cancel");
    requirePaymentConfig();
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const rows = await supabaseRest(`verification_subscriptions?select=id,paystack_subscription_code,paystack_email_token&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&order=created_at.desc&limit=1`);
    if (!rows.length) return json(res, 404, { error: "No active verification subscription was found." });
    if (rows[0].paystack_subscription_code && rows[0].paystack_email_token) {
      await paystack("/subscription/disable", {
        method: "POST",
        body: JSON.stringify({
          code: rows[0].paystack_subscription_code,
          token: rows[0].paystack_email_token,
        }),
      });
    }
    await supabaseRest(`verification_subscriptions?id=eq.${encodeURIComponent(rows[0].id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString() }),
    });
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
