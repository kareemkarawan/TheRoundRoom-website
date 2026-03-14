/**
 * FILE: combo-settings.js
 * PURPOSE: Netlify function to manage bagel+schmear combo settings and availability.
 *
 * NOTES:
 * - GET: Returns combo price, availability, and allowed bagel/schmear IDs
 * - PUT: Updates combo settings (admin only, requires x-admin-token)
 * - Settings stored in MongoDB round_room.combo_settings collection
 * - Single document with id="combo" holds all combo configuration
 * - Uses no-cache headers for GET requests
 * - Default returns unavailable combo if no settings exist
 */

const { MongoClient } = require("mongodb");
const { isAdminAuthorized } = require("./utils");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "combo_settings";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN;

let cachedClient = null;

async function getClient() {
  if (cachedClient) {
    return cachedClient;
  }
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  cachedClient = client;
  return client;
}

function buildHeaders(isAdminRoute = false) {
  const origin = isAdminRoute && ADMIN_ORIGIN ? ADMIN_ORIGIN : "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

// GET: fetch combo settings
async function handleGet() {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // There's only one combo settings document with id "combo"
    let settings = await collection.findOne({ id: "combo" });

    if (!settings) {
      // Return default settings if none exist
      settings = {
        id: "combo",
        price: 0,
        isAvailable: false,
        availableBagels: [],
        availableSchmears: [],
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(settings),
    };
  } catch (err) {
    console.error("GET combo settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// PUT: update combo settings (admin only)
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

  const priceValue = Number(updates.price);
  if (Number.isNaN(priceValue) || priceValue < 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid price value" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const now = new Date();
    const settingsData = {
      id: "combo",
      price: priceValue,
      isAvailable: updates.isAvailable === true,
      availableBagels: Array.isArray(updates.availableBagels) ? updates.availableBagels : [],
      availableSchmears: Array.isArray(updates.availableSchmears) ? updates.availableSchmears : [],
      updatedAt: now,
    };

    await collection.updateOne(
      { id: "combo" },
      { $set: settingsData },
      { upsert: true }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Combo settings updated successfully",
      }),
    };
  } catch (err) {
    console.error("PUT combo settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const body = event.body;
  const isAdminRoute = method !== "GET" && method !== "OPTIONS";

  // CORS headers
  const headers = buildHeaders(isAdminRoute);
  if (method === "GET") {
    // Allow 60s browser caching + CDN caching for faster repeat loads
    headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300";
  }

  // Handle preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (isAdminRoute && !isAdminAuthorized(event.headers, ADMIN_TOKEN)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized: invalid or missing admin token" }),
    };
  }

  let response;

  if (method === "GET") {
    response = await handleGet();
  } else if (method === "PUT") {
    response = await handlePut(body);
  } else {
    response = {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  return {
    ...response,
    headers,
  };
};
