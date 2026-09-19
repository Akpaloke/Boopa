import { admin, authenticatedUser, json, options } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  try {
    const user = await authenticatedUser(req);
    const { data } = await admin.from("verification_subscriptions").select("status,next_payment_date,cancelled_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return json(data || { status: "inactive" });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unable to read verification status." }, 500);
  }
});
