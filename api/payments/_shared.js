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

async function supabaseUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function supabaseRest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(), ...(init.headers || {}) },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const error = new Error(body.message || body.error || "Supabase request failed.");
    error.status = response.status;
    throw error;
  }
  return body;
}

async function paystack(path, init = {}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.status) {
    const error = new Error(body.message || "Paystack request failed.");
    error.status = 502;
    throw error;
  }
  return body.data;
}

function requirePaymentConfig() {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  if (process.env.PAYSTACK_PLAN_CODE && process.env.PAYSTACK_PLAN_CODE !== PLAN_CODE) {
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
  paystack,
  requirePaymentConfig,
  safeError,
  crypto,
};
