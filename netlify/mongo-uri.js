const { MongoClient } = require("mongodb");

const LOCAL_MONGODB_URI = "mongodb://127.0.0.1:27018/round_room_local";
const NETLIFY_RUNTIME_KEYS = ["URL", "SITE_NAME", "SITE_ID"];
const PRODUCTION_MODE = "netlify-production";

function resolveMongoUri(env = process.env) {
  const localDevelopment = env.LOCAL_DEVELOPMENT;
  const context = env.CONTEXT;
  const runtimeMode = env.MONGODB_RUNTIME_MODE;
  const runtimeValues = NETLIFY_RUNTIME_KEYS.map((key) => env[key]);
  const hasCompleteRuntimeMetadata = runtimeValues.every(Boolean);

  if (localDevelopment !== undefined && localDevelopment !== "true") {
    throw new Error("LOCAL_DEVELOPMENT must be unset or exactly 'true'.");
  }

  if (runtimeMode !== undefined && runtimeMode !== "local" && runtimeMode !== PRODUCTION_MODE) {
    throw new Error("MONGODB_RUNTIME_MODE is invalid.");
  }

  let isLocalDevelopment;
  if (localDevelopment === "true") {
    if (runtimeMode === PRODUCTION_MODE || (context !== undefined && context !== "dev")) {
      throw new Error("Conflicting local runtime configuration; refusing MongoDB connection.");
    }
    isLocalDevelopment = true;
  } else if (
    runtimeMode === PRODUCTION_MODE &&
    context === undefined &&
    hasCompleteRuntimeMetadata
  ) {
    isLocalDevelopment = false;
  } else {
    throw new Error("Ambiguous runtime; refusing MongoDB connection.");
  }

  const uri = env.MONGODB_URI;
  if (typeof uri !== "string" || uri.length === 0) {
    throw new Error("MONGODB_URI is required.");
  }

  if (uri.trim() !== uri || /[\s\u0000-\u001f\u007f]/.test(uri) || /%(?![0-9a-f]{2})/i.test(uri)) {
    throw new Error("MONGODB_URI is malformed.");
  }

  let parsedUri;
  try {
    parsedUri = new URL(uri);
  } catch {
    throw new Error("MONGODB_URI is malformed.");
  }

  if (
    !["mongodb:", "mongodb+srv:"].includes(parsedUri.protocol) ||
    !parsedUri.hostname ||
    parsedUri.hash ||
    (parsedUri.protocol === "mongodb+srv:" && parsedUri.port)
  ) {
    throw new Error("MONGODB_URI is malformed.");
  }

  if (
    isLocalDevelopment &&
    uri !== LOCAL_MONGODB_URI
  ) {
    throw new Error("Local development requires mongodb://127.0.0.1:27018/round_room_local.");
  }

  return uri;
}

function createMongoClient(options = {}, env = process.env, MongoClientClass = MongoClient) {
  const uri = resolveMongoUri(env);
  return new MongoClientClass(uri, options);
}

module.exports = { createMongoClient, resolveMongoUri };