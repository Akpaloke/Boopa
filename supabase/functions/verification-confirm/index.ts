import { admin, AMOUNT, CURRENCY, PLAN_CODE, authenticatedUser, json, options, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  try {
    const user = await authenticatedUser(req);
    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") return json({ error: "A transaction reference is required." }, 400);
    const transaction = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
    const transactionPlan = transaction.plan?.plan_code || transaction.plan_code;
    if (transaction.status !== "success" || transaction.amount !== AMOUNT || transaction.currency !== CURRENCY || transactionPlan !== PLAN_CODE || transaction.metadata?.user_id !== user.id) return json({ error: "Paystack returned a payment that could not be matched to this account, plan, or amount." }, 400);
    const subscription = transaction.subscription || {};
    const { data: subscriptionRow, error } = await admin.from("verification_subscriptions").update({
      status: "active",
      paystack_customer_code: transaction.customer?.customer_code,
      paystack_subscription_code: subscription.subscription_code,
      paystack_email_token: subscription.email_token,
      started_at: new Date().toISOString(),
      next_payment_date: subscription.next_payment_date,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("status", "pending").select("id").maybeSingle();
    if (error) throw error;
    if (!subscriptionRow) return json({ error: "No pending verification subscription was found for this payment." }, 409);
    const { error: profileError } = await admin.from("profiles").update({ is_verified: true, verification_status: "active" }).eq("id", user.id);
    if (profileError) throw profileError;
    return json({ status: "active" });
  } catch (error) {
    console.error("Verification confirmation failed:", error instanceof Error ? error.message : "unknown error");
    if (error instanceof Response) return error;
    return json({ error: "Unable to verify payment." }, 500);
  }
});
