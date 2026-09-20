const { json, supabaseUser, supabaseRestAsUser, getBearerToken, safeError, logPaystackEnvironment } = require("./_shared");

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
  try {
    logPaystackEnvironment("status");
    const user = await supabaseUser(req);
    if (!user) return json(res, 401, { error: "Supabase authentication failed. Please log in again." });
    console.log("SUPABASE_AUTH_VERIFIED");
    const token = getBearerToken(req);
    const profiles = await supabaseRestAsUser(`profiles?select=is_verified,verification_status&id=eq.${encodeURIComponent(user.id)}&limit=1`, token);
    const subscriptions = await supabaseRestAsUser(`verification_subscriptions?select=status,next_payment_date,paystack_reference,paystack_authorization_url,paystack_access_code,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`, token);
    const now = Date.now();
    const active = subscriptions.find((item) =>
      item.status === "active"
      && item.next_payment_date
      && new Date(item.next_payment_date).getTime() > now
    );
    const pending = subscriptions.find((item) => item.status === "pending");
    console.log("SUPABASE_STATUS_DATA_LOADED");
    return json(res, 200, {
      status: active ? "active" : pending ? "pending" : "inactive",
      is_verified: Boolean(active && profiles[0]?.is_verified),
      next_payment_date: active?.next_payment_date || null,
      pending_payment: pending ? {
        reference: pending.paystack_reference,
        authorization_url: pending.paystack_authorization_url,
        access_code: pending.paystack_access_code,
      } : null,
    });
  } catch (error) {
    console.error("PAYSTACK_STATUS_FAILED", safeError(error));
    return json(res, error.status >= 400 && error.status < 600 ? error.status : 500, {
      error: safeError(error),
    });
  }
};
