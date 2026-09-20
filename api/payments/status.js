const { json, supabaseUser, supabaseRest, requirePaymentConfig, safeError } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
  try {
    requirePaymentConfig();
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const profiles = await supabaseRest(`profiles?select=is_verified,verification_status&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const subscriptions = await supabaseRest(`verification_subscriptions?select=status,next_payment_date&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=1`);
    return json(res, 200, {
      status: profiles[0]?.verification_status || subscriptions[0]?.status || "inactive",
      is_verified: Boolean(profiles[0]?.is_verified),
      next_payment_date: subscriptions[0]?.next_payment_date || null,
    });
  } catch (error) {
    console.error("PAYSTACK_STATUS_FAILED", safeError(error));
    return json(res, 500, { error: safeError(error) });
  }
};
