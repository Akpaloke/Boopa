import { admin, authenticatedUser, json, options, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  try {
    const user = await authenticatedUser(req);
    const { data: subscription } = await admin.from("verification_subscriptions").select("paystack_subscription_code,paystack_email_token").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!subscription?.paystack_subscription_code || !subscription.paystack_email_token) return json({ error: "No active subscription found." }, 404);
    await paystack("/subscription/disable", { method: "POST", body: JSON.stringify({ code: subscription.paystack_subscription_code, token: subscription.paystack_email_token }) });
    await admin.from("verification_subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("paystack_subscription_code", subscription.paystack_subscription_code);
    const { error: profileError } = await admin.from("profiles").update({ is_verified: false, verification_status: "cancelled" }).eq("id", user.id);
    if (profileError) throw profileError;
    return json({ status: "cancelled" });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unable to cancel verification subscription." }, 500);
  }
});
