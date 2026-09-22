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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
    if (!secret || request.headers.get("x-push-webhook-secret") !== secret)
      return json({ error: "Unauthorized" }, 401);
    const record = (await request.json())?.record;
    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (!record?.user_id || !appId || !restApiKey)
      return json({ error: "OneSignal is not configured." }, 500);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    let sender = "Someone";
    if (record.actor_id) {
      const { data } = await admin.from("profiles").select("full_name").eq("id", record.actor_id).maybeSingle();
      sender = data?.full_name || sender;
    }
    const actorUrl = record.actor_id
      ? `https://boopa-con.vercel.app/?open=profile&user_id=${encodeURIComponent(record.actor_id)}`
      : "https://boopa-con.vercel.app/?open=notifications";
    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: { Authorization: `Key ${restApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { external_id: [record.user_id] },
        headings: { en: record.type === "message" ? "💬 Boopa" : "Boopa" },
        contents: { en: record.type === "message" ? `${sender} sent you a message` : record.message || "You have a new Boopa notification." },
        url: actorUrl,
        chrome_web_icon: "https://boopa-con.vercel.app/boopa-icon-192.png",
        chrome_web_badge: "https://boopa-con.vercel.app/boopa-icon-192.png",
        ttl: 86400,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("BOOPA_ONESIGNAL_FAILED", result);
      return json({ error: "OneSignal delivery failed." }, 502);
    }
    return json({ sent: true, id: result.id || null });
  } catch (error) {
    console.error("BOOPA_ONESIGNAL_HANDLER_FAILED", error.message || error);
    return json({ error: "OneSignal notification delivery failed." }, 500);
  }
});
