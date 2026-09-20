const { crypto, json, supabaseRest, requirePaymentConfig, safeError, logPaystackEnvironment } = require("./_shared");

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  try {
    logPaystackEnvironment("paystack-webhook");
    requirePaymentConfig();
    const signature = req.headers["x-paystack-signature"];
    const raw = await rawBody(req);
    const expected = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
    const signatureBuffer = Buffer.from(String(signature || ""), "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return json(res, 401, { error: "Invalid webhook signature." });
    }
    const event = JSON.parse(raw);
    const data = event.data || {};
    const metadata = data.metadata || {};
    const plan = data.plan?.plan_code || data.plan;
    if (
      event.event === "charge.success"
      && data.reference
      && Number(data.amount) === 20000
      && data.currency === "NGN"
      && plan === "PLN_wr6p28z1zstqalb"
      && metadata.verification_type === "profile"
      && metadata.user_id
    ) {
      const reference = data.reference;
      const rows = await supabaseRest(`verification_subscriptions?select=id,user_id,status&paystack_reference=eq.${encodeURIComponent(reference)}&limit=1`);
      if (rows.length && rows[0].user_id === metadata.user_id) {
        if (rows[0].status === "active") return json(res, 200, { received: true, duplicate: true });
        const startedAt = new Date();
        const nextPaymentDate = new Date(startedAt);
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
        await supabaseRest(`verification_subscriptions?id=eq.${encodeURIComponent(rows[0].id)}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "active", started_at: startedAt.toISOString(), next_payment_date: nextPaymentDate.toISOString() }),
        });
        await supabaseRest(`profiles?id=eq.${encodeURIComponent(rows[0].user_id)}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ is_verified: true, verification_status: "active" }),
        });
      }
    }
    return json(res, 200, { received: true });
  } catch (error) {
    console.error("PAYSTACK_WEBHOOK_FAILED", safeError(error));
    return json(res, 500, { error: "Webhook processing failed." });
  }
};

module.exports.config = { api: { bodyParser: false } };
