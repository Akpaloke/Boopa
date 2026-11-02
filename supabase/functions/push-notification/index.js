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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!publicKey || !privateKey || !supabaseUrl || !serviceRoleKey) return json({ error: "Push service is not configured." }, 500);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@boopa.app", publicKey, privateKey);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    if (record.type === "message" && record.actor_id) {
      const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: activePresence, error: presenceError } = await admin
        .from("active_chat_presence")
        .select("user_id")
        .eq("user_id", record.user_id)
        .eq("chat_user_id", record.actor_id)
        .gte("updated_at", cutoff)
        .maybeSingle();
      if (presenceError) throw presenceError;
      if (activePresence) return json({ sent: 0, suppressed: 1, reason: "active_conversation" });
    }
    const { data: subscriptions, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", record.user_id);
    if (error) throw error;
    const senderResult = record.actor_id ? await admin.from("profiles").select("full_name").eq("id", record.actor_id).maybeSingle() : { data: null };
    const senderName = senderResult.data?.full_name || "Someone";
    const allowedTypes = new Set(["message", "friend_request", "friend_request_accepted", "community", "opportunity", "system"]);
    const type = allowedTypes.has(record.type) ? record.type : "system";
    const eventCopy = {
      message: { title: "New message", body: `${senderName} sent you a message.` },
      friend_request: { title: "New connection request", body: `${senderName} wants to connect with you on Boopa.` },
      friend_request_accepted: { title: "Connection accepted", body: `${senderName} accepted your connection request.` },
    };
    const fallbackCopy = { title: "Boopa", body: record.message || "You have a new Boopa notification." };
    const copy = eventCopy[type] || fallbackCopy;
    const url = type === "message" && record.actor_id
      ? `/?open=messages&user_id=${encodeURIComponent(record.actor_id)}`
      : type === "friend_request_accepted" && record.actor_id
        ? `/?open=profile&user_id=${encodeURIComponent(record.actor_id)}`
        : "/?open=notifications";
    const notification = {
      type,
      title: copy.title,
      body: copy.body,
      url,
      icon: "/boopa-icon-192.png",
      badge: "/boopa-icon-192.png",
      tag: `boopa-${record.id || `${type}-${record.user_id}`}`,
      notificationId: record.id || null,
      senderId: record.actor_id || null,
      data: { senderId: record.actor_id || null, notificationId: record.id || null },
    };
    const deliveries = await Promise.all((subscriptions || []).map(async subscription => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(notification),
          { TTL: 60 * 60, urgency: "high" },
        );
        return { ok: true };
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          if (deleteError) throw deleteError;
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
