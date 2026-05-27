import "dotenv/config";

const role = (process.argv[2] ?? process.env.STOCKSHIELD_PROCESS ?? "api").toLowerCase();
const validRoles = new Set(["api", "worker", "scheduler", "all"]);

if (!validRoles.has(role)) {
  fail([`Unknown role "${role}". Use api, worker, scheduler, or all.`], []);
}

const errors = [];
const warnings = [];

const commonRequired = ["DATABASE_URL", "REDIS_URL", "STOCKSHIELD_ENCRYPTION_KEY"];
const roleRequired = {
  api: ["SHOPIFY_WEBHOOK_SECRET"],
  worker: ["OMS_DATABASE_URL"],
  scheduler: [],
};

for (const key of commonRequired) {
  requireEnv(key);
}

if (role === "all") {
  for (const keys of Object.values(roleRequired)) {
    for (const key of keys) {
      requireEnv(key);
    }
  }
} else {
  for (const key of roleRequired[role] ?? []) {
    requireEnv(key);
  }
}

if (process.env.STOCKSHIELD_AUTH_DISABLED !== "true") {
  requireEnv("STOCKSHIELD_INTERNAL_API_TOKEN");
  requireEnv("STOCKSHIELD_JWT_SECRET");
}

validateUrl("DATABASE_URL", ["postgres:", "postgresql:"]);
validateUrl("REDIS_URL", ["redis:", "rediss:"]);
if (process.env.OMS_DATABASE_URL) {
  validateUrl("OMS_DATABASE_URL", ["postgres:", "postgresql:"]);
}
if (process.env.SLACK_WEBHOOK_URL) {
  validateUrl("SLACK_WEBHOOK_URL", ["https:"]);
}

warnIfDefault("STOCKSHIELD_ENCRYPTION_KEY", [
  "change-this-local-dev-secret",
  "stockshield-dev-key-change-me",
  "compose-local-encryption-key-change-before-prod",
]);
warnIfDefault("STOCKSHIELD_INTERNAL_API_TOKEN", [
  "change-this-local-admin-token",
  "compose-local-admin-token",
]);
warnIfDefault("STOCKSHIELD_JWT_SECRET", [
  "change-this-local-dashboard-jwt-secret",
  "compose-local-dashboard-jwt-secret",
]);
warnIfDefault("SHOPIFY_WEBHOOK_SECRET", [
  "replace-with-shopify-client-secret",
  "compose-local-webhook-secret",
]);

const encryptionKey = process.env.STOCKSHIELD_ENCRYPTION_KEY;
if (encryptionKey && encryptionKey.length < 24) {
  warnings.push("STOCKSHIELD_ENCRYPTION_KEY should be at least 24 characters.");
}

if (errors.length) {
  fail(errors, warnings);
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}
console.log(`OK StockShield ${role} environment passed preflight checks.`);

function requireEnv(key) {
  if (!process.env[key]) {
    errors.push(`${key} is required.`);
  }
}

function validateUrl(key, protocols) {
  const value = process.env[key];
  if (!value) {
    return;
  }

  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      errors.push(`${key} must use one of: ${protocols.join(", ")}`);
    }
  } catch {
    errors.push(`${key} must be a valid URL.`);
  }
}

function warnIfDefault(key, defaults) {
  const value = process.env[key];
  if (value && defaults.includes(value)) {
    warnings.push(`${key} is still using a local/example value.`);
  }
}

function fail(messages, warningMessages) {
  for (const warning of warningMessages) {
    console.warn(`WARN ${warning}`);
  }
  for (const message of messages) {
    console.error(`ERROR ${message}`);
  }
  process.exit(1);
}
