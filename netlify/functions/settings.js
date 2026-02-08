const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "settings";
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

function buildHeaders(isPublic = false) {
  const origin = isPublic ? "*" : (ADMIN_ORIGIN || "*");
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

async function handleGet(isAdmin = false) {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const settings = await collection.findOne({ key: "store" });
    if (!isAdmin) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          storeOpen: typeof settings?.storeOpen === "boolean" ? settings.storeOpen : true,
          minOrder: Number(settings?.minOrder ?? 0),
        }),
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(settings || { key: "store" }),
    };
  } catch (err) {
    console.error("GET settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

async function handlePut(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let updates;
  try {
    updates = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const next = {
    taxRate: Number(updates.taxRate ?? 5),
    currency: updates.currency || "INR",
    invoicePrefix: updates.invoicePrefix || "ORD",
    storeOpen: typeof updates.storeOpen === "boolean" ? updates.storeOpen : true,
    minOrder: Number(updates.minOrder ?? 0),
    updatedAt: new Date(),
  };

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    await collection.updateOne(
      { key: "store" },
      { $set: { key: "store", ...next } },
      { upsert: true }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("PUT settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const isAdmin = isAdminAuthorized(event.headers);
  const isAdminRequest = event.queryStringParameters?.admin === "1";
  const headers = buildHeaders(!(isAdmin && isAdminRequest));

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (method === "GET") {
    if (isAdminRequest && !isAdmin) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    return { ...(await handleGet(isAdmin && isAdminRequest)), headers };
  }

  if (!isAdmin) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  if (method === "PUT") {
    return { ...(await handlePut(event.body)), headers };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
