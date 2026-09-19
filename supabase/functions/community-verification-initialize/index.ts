import { admin, CURRENCY, PLAN_CODE, authenticatedUser, json, options, paystack } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return options();
  try {
    const user = await authenticatedUser(req);
    const { community_id } = await req.json();
    if (!community_id) return json({ error: "A community is required." }, 400);
    const { data: community } = await admin.from("communities").select("id,owner_id").eq("id", community_id).eq("owner_id", user.id).single();
    if (!community) return json({ error: "Only the community owner can verify it." }, 403);
    const { data: existing } = await admin.from("community_verification_subscriptions").select("id").eq("community_id", community_id).in("status", ["pending", "active"]).maybeSingle();
    if (existing) return json({ error: "This community already has a subscription." }, 409);
    const transaction = await paystack("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: user.email, amount: 100000, currency: CURRENCY, plan: PLAN_CODE, metadata: { community_id, owner_id: user.id, verification_type: "community" } }) });
    await admin.from("community_verification_subscriptions").insert({ community_id, owner_id: user.id, plan_code: PLAN_CODE, amount: 100000, status: "pending" });
    return json({ access_code: transaction.access_code, reference: transaction.reference });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unable to initialize community verification." }, 500);
  }
});
