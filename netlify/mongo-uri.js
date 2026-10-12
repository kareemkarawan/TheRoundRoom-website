const { MongoClient } = require("mongodb");

function resolveMongoUri(env = process.env) {
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

  return uri;
}

function createMongoClient(options = {}, env = process.env, MongoClientClass = MongoClient) {
  const uri = resolveMongoUri(env);
  return new MongoClientClass(uri, options);
}

module.exports = { createMongoClient, resolveMongoUri };