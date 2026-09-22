import webpush from "npm:web-push";
import { createClient } from "npm:@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-push-webhook-secret",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const sendPush = async (subscription, payload) => {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
  );
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (
      !webhookSecret ||
      request.headers.get("x-push-webhook-secret") !== webhookSecret
    ) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await request.json();
    const record = body?.record;
    if (!record?.user_id) {
      return json({ error: "Notification record is incomplete." }, 400);
    }

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!publicKey || !privateKey || !supabaseUrl || !serviceRoleKey) {
      return json({ error: "Phone notifications are not configured." }, 500);
    }

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@boopa.app",
      publicKey,
      privateKey,
    );

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", record.user_id);
    if (subscriptionError) throw subscriptionError;

    let senderName = "Someone";
    if (record.actor_id) {
      const { data: actor, error: actorError } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", record.actor_id)
        .maybeSingle();
      if (!actorError && actor?.full_name) senderName = actor.full_name;
    }

    const type = record.type || "notification";
    const text = record.message || "You have a new Boopa notification.";
    const actorUrl = record.actor_id
      ? `/?open=profile&user_id=${encodeURIComponent(record.actor_id)}`
      : "/?open=notifications";
    const payload = {
      type,
      title: type === "message" ? "💬 Boopa" : "Boopa",
      body: type === "message" ? `${senderName} sent you a message` : text,
      message: type === "message" ? text : "",
      senderId: record.actor_id || null,
      profileUrl: actorUrl,
      chatUrl:
        type === "message" && record.actor_id
          ? `/?open=messages&user_id=${encodeURIComponent(record.actor_id)}`
          : actorUrl,
    };

    const results = await Promise.all(
      (subscriptions || []).map(async (subscription) => {
        try {
          await sendPush(subscription, payload);
          return { delivered: true, expired: false };
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id);
            return { delivered: false, expired: true };
          }
          console.error("BOOPA_PUSH_DELIVERY_FAILED", error.message || error);
          return { delivered: false, expired: false };
        }
      }),
    );

    const delivered = results.filter((result) => result.delivered).length;
    const removed = results.filter((result) => result.expired).length;
    const failed = results.filter(
      (result) => !result.delivered && !result.expired,
    ).length;

    return json({ delivered, removed, failed });
  } catch (error) {
    console.error("BOOPA_NOTIFICATIONS_FAILED", error.message || error);
    return json({ error: "Phone notification delivery failed." }, 500);
  }
});
