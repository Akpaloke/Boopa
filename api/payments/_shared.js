const crypto = require("node:crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://uhjezsadlbtrapiyzqrt.supabase.co";
const PLAN_CODE = "PLN_qqy4dlftp0esmsr";
const AMOUNT = 20000;
const CURRENCY = "NGN";

function json(res, status, body) {
  res.status(status).json(body);
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function supabasePublicKey() {
  return normalizeSecret(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "");
}

function normalizeSecret(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function paystackEnvironmentLabel(secret) {
  secret = normalizeSecret(secret);
  if (!secret) return "missing";
  if (secret.startsWith("sk_live_")) return "live";
  if (secret.startsWith("sk_test_")) return "test";
  return "unexpected";
}

function logPaystackEnvironment(route) {
  const secret = normalizeSecret(process.env.PAYSTACK_SECRET_KEY);
  console.log("PAYSTACK_ROUTE_REACHED", route);
  console.log("PAYSTACK_SECRET_ENV_EXISTS", Boolean(secret));
  console.log("PAYSTACK_SECRET_PREFIX", paystackEnvironmentLabel(secret));
  console.log("SUPABASE_URL_CONFIGURED", Boolean(SUPABASE_URL));
  console.log("SUPABASE_PUBLIC_KEY_CONFIGURED", Boolean(supabasePublicKey()));
}

async function supabaseUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: supabasePublicKey(),
      Authorization: "Bearer " + token,
    },
  });
  if (!response.ok) {
    const body = await readJsonResponse(response);
    console.error("[SUPABASE] authentication failed", response.status, body.message || body.error || "unknown error");
    if (String(body.message || body.error || "").toLowerCase().includes("invalid api key")) {
      const error = new Error("Supabase public API key was rejected by the configured project.");
      error.status = 502;
      throw error;
    }
    return null;
  }
  return response.json();
}

function supabaseHeaders() {
  const key = normalizeSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
}

function supabaseUserHeaders(token) {
  return {
    apikey: supabasePublicKey(),
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function responseError(body, fallback, status) {
  const error = new Error(body.message || body.error || fallback);
  error.status = status;
  return error;
}

async function supabaseRest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(), ...(init.headers || {}) },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    console.error("[SUPABASE] database request failed", response.status, body.message || body.error || "unknown error");
    throw responseError(body, "Supabase request failed.", response.status);
  }
  return body;
}

async function supabaseRestAsUser(path, token, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseUserHeaders(token), ...(init.headers || {}) },
  });
  const body = await readJsonResponse(response);
  console.log("SUPABASE_DATABASE_RESPONSE_STATUS", response.status);
  if (!response.ok) {
    console.error("[SUPABASE] database request failed", response.status, body.message || body.error || "unknown error");
    throw responseError(body, "Supabase request failed.", response.status);
  }
  return body;
}

async function paystack(path, init = {}) {
  const secret = normalizeSecret(process.env.PAYSTACK_SECRET_KEY);
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await readJsonResponse(response);
  console.log("PAYSTACK_RESPONSE_STATUS", response.status);
  if (!response.ok || !body.status) {
    console.error("[PAYSTACK] request failed", response.status, body.message || body.error || "unknown error");
    throw responseError(body, "Paystack request failed.", 502);
  }
  return body.data;
}

function requirePaymentConfig() {
  if (!normalizeSecret(process.env.PAYSTACK_SECRET_KEY)) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  if (!normalizeSecret(process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  if (normalizeSecret(process.env.PAYSTACK_PLAN_CODE) && normalizeSecret(process.env.PAYSTACK_PLAN_CODE) !== PLAN_CODE) {
    throw new Error("PAYSTACK_PLAN_CODE is configured incorrectly.");
  }
}

function safeError(error) {
  return error instanceof Error ? error.message : "Payment service is unavailable. Please try again.";
}

module.exports = {
  AMOUNT,
  CURRENCY,
  PLAN_CODE,
  json,
  supabaseUser,
  supabaseRest,
  supabaseRestAsUser,
  getBearerToken,
  paystack,
  requirePaymentConfig,
  logPaystackEnvironment,
  safeError,
  crypto,
};
