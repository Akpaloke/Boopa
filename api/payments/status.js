const { json, supabaseUser, supabaseRestAsUser, getBearerToken, safeError, logPaystackEnvironment } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
  try {
    logPaystackEnvironment("status");
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Unauthorized" });
    console.log("SUPABASE_AUTH_VERIFIED");
    const token = getBearerToken(req);
    const profiles = await supabaseRestAsUser(`profiles?select=is_verified,verification_status&id=eq.${encodeURIComponent(user.id)}&limit=1`, token);
    const subscriptions = await supabaseRestAsUser(`verification_subscriptions?select=status,next_payment_date&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=1`, token);
    console.log("SUPABASE_STATUS_DATA_LOADED");
    return json(res, 200, {
      status: profiles[0]?.verification_status || subscriptions[0]?.status || "inactive",
      is_verified: Boolean(profiles[0]?.is_verified),
      next_payment_date: subscriptions[0]?.next_payment_date || null,
    });
  } catch (error) {
    console.error("PAYSTACK_STATUS_FAILED", safeError(error));
    return json(res, error.status >= 400 && error.status < 600 ? error.status : 500, {
      error: safeError(error),
    });
  }
};
