import { admin, AMOUNT, CURRENCY, PLAN_CODE, authenticatedUser, json, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  try {
    const user = await authenticatedUser(req);
    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") return json({ error: "A transaction reference is required." }, 400);
    const transaction = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (transaction.status !== "success" || transaction.amount !== AMOUNT || transaction.currency !== CURRENCY || transaction.plan?.plan_code !== PLAN_CODE || transaction.metadata?.user_id !== user.id) return json({ error: "Payment details could not be validated." }, 400);
    const subscription = transaction.subscription || {};
    const { error } = await admin.from("verification_subscriptions").update({
      status: "active",
      paystack_customer_code: transaction.customer?.customer_code,
      paystack_subscription_code: subscription.subscription_code,
      paystack_email_token: subscription.email_token,
      started_at: new Date().toISOString(),
      next_payment_date: subscription.next_payment_date,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("status", "pending");
    if (error) throw error;
    await admin.from("profiles").update({ is_verified: true, verification_status: "active" }).eq("id", user.id);
    return json({ status: "active" });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unable to verify payment." }, 500);
  }
});
