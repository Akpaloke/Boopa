// Deployment configuration. Inject these frontend-safe values from the hosting environment.
window.BOOPA_CONFIG = window.BOOPA_CONFIG || {
  supabaseUrl: "https://uhjezsadlbtrapiyzqrt.supabase.co",
  supabasePublishableKey: "sb_publishable_qZ7tTGYfitjFpkAiFSDinQ_7PUE1T1Q",
  paymentApiBaseUrl: "",
  paystackPublicKey: "pk_live_3fcd540323b6d8cb53bebb18f5febc8ebb47c119",
  paystackPlanCode: "PLN_qqy4dlftp0esmsr"
};

(() => {
  const required = ["supabaseUrl", "supabasePublishableKey", "paystackPublicKey", "paystackPlanCode"];
  const missing = required.filter(key => !window.BOOPA_CONFIG[key]);
  if (missing.length) console.warn(`Boopa public configuration is incomplete: ${missing.join(", ")}`);
})();
