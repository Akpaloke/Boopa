import { createHmac } from "node:crypto";
import { admin, PLAN_CODE } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  const expected = createHmac("sha512", Deno.env.get("PAYSTACK_SECRET_KEY")!).update(raw).digest("hex");
  if (signature.length !== expected.length) return new Response("Invalid signature", { status: 401 });
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  if (difference !== 0) return new Response("Invalid signature", { status: 401 });
  const event = JSON.parse(raw);
  const data = event.data || {};
  const userId = data.metadata?.user_id;
  if (!userId && !data.customer?.email) return new Response("ok");
  const user = userId ? { id: userId } : (await admin.auth.admin.listUsers()).data.users.find((item) => item.email === data.customer.email);
  if (!user) return new Response("ok");
  const planCode = data.plan?.plan_code || data.subscription?.plan?.plan_code;
  const isCommunityVerification = data.metadata?.verification_type === "community";
  if (!isCommunityVerification && event.event === "charge.success" && (data.amount !== 20000 || data.currency !== "NGN" || planCode !== PLAN_CODE)) return new Response("ok");
  const status = event.event === "charge.success" || event.event === "subscription.create" ? "active" :
    event.event === "invoice.payment_failed" ? "failed" :
    ["subscription.disable", "subscription.not_renewed"].includes(event.event) ? "cancelled" : null;
  if (status && !isCommunityVerification) {
    await admin.from("verification_subscriptions").update({ status, paystack_customer_code: data.customer?.customer_code, paystack_subscription_code: data.subscription?.subscription_code || data.subscription_code, paystack_email_token: data.subscription?.email_token || data.email_token, paystack_plan_code: planCode || PLAN_CODE, next_payment_date: data.next_payment_date, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    await admin.from("profiles").update({ is_verified: status === "active", verification_status: status || "inactive" }).eq("id", user.id);
  }
  return new Response("ok");
});
