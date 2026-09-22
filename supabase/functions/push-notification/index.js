import webpush from "npm:web-push";
import { createClient } from "npm:@supabase/supabase-js";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-webhook-secret" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (!secret || request.headers.get("x-push-webhook-secret") !== secret) return json({ error: "Unauthorized" }, 401);
    const record = (await request.json()).record;
    if (!record?.user_id) return json({ error: "Notification record is incomplete." }, 400);
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!publicKey || !privateKey) return json({ error: "Push service is not configured." }, 500);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@boopa.app", publicKey, privateKey);
    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: subscriptions, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", record.user_id);
    if (error) throw error;
    const senderResult = record.actor_id ? await admin.from("profiles").select("full_name").eq("id", record.actor_id).maybeSingle() : { data: null };
    const senderName = senderResult.data?.full_name || "Someone";
    const type = record.type || "notification";
    const notificationText = record.message || record.title || "You have a new Boopa notification.";
    const message = type === "message" ? notificationText.replace(/^.*sent you a new message\.\s*/i, "").slice(0, 240) : "";
    const actorUrl = record.actor_id ? `/?open=profile&user_id=${encodeURIComponent(record.actor_id)}` : "/?open=notifications";
    const notification = { type, title: type === "message" ? "💬 Boopa" : "Boopa", body: type === "message" ? `${senderName} sent you a message` : notificationText, message, senderId: record.actor_id || null, profileUrl: actorUrl, chatUrl: type === "message" && record.actor_id ? `/?open=messages&user_id=${encodeURIComponent(record.actor_id)}` : actorUrl };
    const deliveries = await Promise.all((subscriptions || []).map(async subscription => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(notification));
        return { ok: true };
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          return { ok: false, expired: true };
        }
        console.error("PUSH_DELIVERY_FAILED", error.message || "unknown error");
        return { ok: false, expired: false };
      }
    }));
    const failed = deliveries.filter(delivery => !delivery.ok && !delivery.expired).length;
    if (failed) return json({ error: "One or more phone notifications could not be delivered.", sent: deliveries.filter(delivery => delivery.ok).length, failed }, 502);
    return json({ sent: deliveries.filter(delivery => delivery.ok).length, removed: deliveries.filter(delivery => delivery.expired).length });
  } catch (error) { console.error("PUSH_NOTIFICATION_FAILED", error.message || "unknown error"); return json({ error: "Push notification delivery failed." }, 500); }
});
