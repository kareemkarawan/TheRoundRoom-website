const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "menu";
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

function getAdminToken(headers = {}) {
  return headers["x-admin-token"] || headers["X-Admin-Token"] || headers["x-admin-token".toLowerCase()];
}

function isAdminAuthorized(headers = {}) {
  if (!ADMIN_TOKEN) return false;
  const token = getAdminToken(headers);
  return token && token === ADMIN_TOKEN;
}

function buildHeaders(isAdminRoute = false) {
  const origin = isAdminRoute && ADMIN_ORIGIN ? ADMIN_ORIGIN : "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

// GET: fetch all menu items
async function handleGet() {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const items = await collection.find({}).toArray();

    return {
      statusCode: 200,
      body: JSON.stringify(items),
    };
  } catch (err) {
    console.error("GET error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// POST: add a new menu item (admin only)
async function handlePost(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let item;
  try {
    item = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const priceValue = Number(item.price);
  const availability = typeof item.isAvailable === "boolean" ? item.isAvailable : true;

  // Validate required fields
  if (!item.id || !item.name || !item.category || Number.isNaN(priceValue)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required fields: id, name, category, price",
      }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const now = new Date();
    const result = await collection.insertOne({
      id: item.id,
      name: item.name,
      category: item.category,
      price: priceValue,
      imageUrl: item.imageUrl || "",
      isAvailable: availability,
      createdAt: now,
      updatedAt: now,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        id: result.insertedId,
        message: "Menu item added successfully",
      }),
    };
  } catch (err) {
    console.error("POST error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// PUT: update a menu item by id
async function handlePut(body, itemId) {
  if (!itemId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Item ID required" }),
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

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.updateOne(
      { id: itemId },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Menu item not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Menu item updated successfully",
      }),
    };
  } catch (err) {
    console.error("PUT error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// DELETE: remove a menu item by id
async function handleDelete(itemId) {
  if (!itemId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Item ID required" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.deleteOne({ id: itemId });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Menu item not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Menu item deleted successfully",
      }),
    };
  } catch (err) {
    console.error("DELETE error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const body = event.body;
  const itemId = event.queryStringParameters?.id;
  const isAdminRoute = method !== "GET" && method !== "OPTIONS";

  // CORS headers
  const headers = buildHeaders(isAdminRoute);
  if (method === "GET") {
    headers["Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=60";
  }

  // Handle preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (isAdminRoute && !isAdminAuthorized(event.headers)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized: invalid or missing admin token" }),
    };
  }

  let response;

  if (method === "GET") {
    response = await handleGet();
  } else if (method === "POST") {
    response = await handlePost(body);
  } else if (method === "PUT") {
    response = await handlePut(body, itemId);
  } else if (method === "DELETE") {
    response = await handleDelete(itemId);
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
