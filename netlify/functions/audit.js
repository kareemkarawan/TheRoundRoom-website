const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "audit_logs";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN;

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  cachedClient = client;
  return client;
}

function getAdminToken(headers = {}) {
  return headers["x-admin-token"] || headers["X-Admin-Token"] || headers["x-admin-token".toLowerCase()];
}

function isAdminAuthorized(headers = {}) {
  if (!ADMIN_TOKEN) return false;
  const token = getAdminToken(headers);
  return token && token === ADMIN_TOKEN;
}

function buildHeaders(isAdminRoute = true) {
  const origin = isAdminRoute && ADMIN_ORIGIN ? ADMIN_ORIGIN : "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

function normalizeLimit(value) {
  const parsed = Number(value || 0);
  if (Number.isNaN(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 300);
}

async function handleGet(params = {}) {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const query = {};
    if (params.type) query.type = params.type;
    if (params.level) query.level = params.level;
    if (params.source) query.source = params.source;
    if (params.since) {
      const sinceDate = new Date(params.since);
      if (!Number.isNaN(sinceDate.getTime())) {
        query.createdAt = { $gte: sinceDate };
      }
    }

    const limit = normalizeLimit(params.limit);
    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const cleaned = docs.map((doc) => ({
      id: doc._id?.toString(),
      type: doc.type,
      level: doc.level,
      message: doc.message,
      details: doc.details,
      source: doc.source,
      url: doc.url,
      userAgent: doc.userAgent,
      meta: doc.meta,
      createdAt: doc.createdAt,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(cleaned),
    };
  } catch (err) {
    console.error("GET audit error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

async function handlePost(body) {
  if (!body) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
  }

  let payload;
  try {
    payload = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!payload.message) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing message" }) };
  }

  const entry = {
    type: payload.type || "action",
    level: payload.level || "info",
    message: payload.message,
    details: payload.details || null,
    source: payload.source || "admin",
    url: payload.url || null,
    userAgent: payload.userAgent || null,
    meta: payload.meta || null,
    createdAt: new Date(),
  };

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const result = await collection.insertOne(entry);

    return {
      statusCode: 201,
      body: JSON.stringify({ success: true, id: result.insertedId }),
    };
  } catch (err) {
    console.error("POST audit error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

async function handleDelete(params = {}) {
  const deleteAll = params.all === "1";
  const beforeParam = params.before;
  if (!deleteAll && !beforeParam) {
    return { statusCode: 400, body: JSON.stringify({ error: "Specify all=1 or before=ISO date" }) };
  }

  const query = {};
  if (!deleteAll) {
    const beforeDate = new Date(beforeParam);
    if (Number.isNaN(beforeDate.getTime())) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid before date" }) };
    }
    query.createdAt = { $lt: beforeDate };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const result = await collection.deleteMany(query);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, deletedCount: result.deletedCount }),
    };
  } catch (err) {
    console.error("DELETE audit error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const headers = buildHeaders(true);

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (!isAdminAuthorized(event.headers)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  if (method === "GET") {
    return { ...(await handleGet(event.queryStringParameters || {})), headers };
  }

  if (method === "POST") {
    return { ...(await handlePost(event.body)), headers };
  }

  if (method === "DELETE") {
    return { ...(await handleDelete(event.queryStringParameters || {})), headers };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
};
