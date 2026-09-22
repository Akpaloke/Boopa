// Deployment configuration. Inject these frontend-safe values from the hosting environment.
window.BOOPA_CONFIG = window.BOOPA_CONFIG || {
  supabaseUrl: "https://uhjezsadlbtrapiyzqrt.supabase.co",
  supabasePublishableKey: "sb_publishable_qZ7tTGYfitjFpkAiFSDinQ_7PUE1T1Q",
  paymentApiBaseUrl: "",
  paystackPublicKey: "pk_live_3fcd540323b6d8cb53bebb18f5febc8ebb47c119",
  paystackPlanCode: "PLN_wr6p28z1zstqalb",
  // Optional OneSignal Web Push app ID. Keep the REST API key server-side.
  oneSignalAppId: "",
  // Set this to the browser-safe VAPID public key used by the push Edge Function.
  pushVapidPublicKey: "BGSSSuv5NQ6LbtGcwWfO-aIMyLv-9M-r2id_JzbrprkrwrQQFGFQ_vHn7vD_hfvJcg6LFS_V16CHX3QKwiUh-ps"
};

(() => {
  const required = ["supabaseUrl", "supabasePublishableKey", "paystackPublicKey", "paystackPlanCode", "pushVapidPublicKey"];
  const missing = required.filter(key => !window.BOOPA_CONFIG[key]);
  if (missing.length) console.warn(`Boopa public configuration is incomplete: ${missing.join(", ")}`);
})();
