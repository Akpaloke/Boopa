import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-webhook-secret" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (!secret || req.headers.get("x-push-webhook-secret") !== secret) return response({ error: "Unauthorized" }, 401);
    const record = (await req.json()).record;
    if (!record?.user_id || !record?.message) return response({ error: "Notification record is incomplete." }, 400);
    webpush.setVapidDetails(Deno.env.get("PUSH_VAPID_SUBJECT") || "mailto:admin@boopa.app", Deno.env.get("PUSH_VAPID_PUBLIC_KEY") || "", Deno.env.get("PUSH_VAPID_PRIVATE_KEY") || "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: subscriptions, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", record.user_id);
    if (error) throw error;
    await Promise.all((subscriptions || []).map(async subscription => {
      try {
        const url = record.type === "message" && record.actor_id
          ? `/?open=messages&user_id=${encodeURIComponent(record.actor_id)}`
          : "/?open=notifications";
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: record.type === "message" ? "Boopa 💬" : "Boopa", body: record.message, url }));
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        else console.error("PUSH_DELIVERY_FAILED", error?.message || "unknown error");
      }
    }));
    return response({ sent: subscriptions?.length || 0 });
  } catch (error) { console.error("PUSH_NOTIFICATION_FAILED", error?.message || "unknown error"); return response({ error: "Push notification delivery failed." }, 500); }
});
