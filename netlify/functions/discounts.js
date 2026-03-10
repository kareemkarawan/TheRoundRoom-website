const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "discounts";
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

// GET: fetch all discounts (optionally only active ones)
async function handleGet(event) {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const params = event.queryStringParameters || {};
    const filter = params.activeOnly === "true" ? { isActive: true } : {};
    const discounts = await collection.find(filter).toArray();

    return {
      statusCode: 200,
      body: JSON.stringify(discounts),
    };
  } catch (err) {
    console.error("GET discounts error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// POST: add a new discount (admin only)
async function handlePost(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let discount;
  try {
    discount = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const percentageValue = Number(discount.percentage);
  const usesPerUser = Number(discount.usesAllowedPerUser);

  // Validate required fields
  if (!discount.id || !discount.name || Number.isNaN(percentageValue)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required fields: id, name, percentage",
      }),
    };
  }

  if (percentageValue < 0 || percentageValue > 100) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Percentage must be between 0 and 100" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Check if discount ID already exists
    const existing = await collection.findOne({ id: discount.id });
    if (existing) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Discount with this ID already exists" }),
      };
    }

    const now = new Date();
    const result = await collection.insertOne({
      id: discount.id,
      name: discount.name,
      description: discount.description || "",
      percentage: percentageValue,
      usesAllowedPerUser: Number.isNaN(usesPerUser) || usesPerUser < 0 ? 1 : usesPerUser,
      isActive: discount.isActive !== false,
      createdAt: now,
      updatedAt: now,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        id: result.insertedId,
        message: "Discount added successfully",
      }),
    };
  } catch (err) {
    console.error("POST discount error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// PUT: update a discount by id
async function handlePut(body, discountId) {
  if (!discountId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Discount ID required" }),
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

  // Validate percentage if provided
  if (updates.percentage !== undefined) {
    const percentageValue = Number(updates.percentage);
    if (Number.isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Percentage must be between 0 and 100" }),
      };
    }
    updates.percentage = percentageValue;
  }

  // Validate usesAllowedPerUser if provided
  if (updates.usesAllowedPerUser !== undefined) {
    const usesPerUser = Number(updates.usesAllowedPerUser);
    if (Number.isNaN(usesPerUser) || usesPerUser < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Uses per user must be a positive number" }),
      };
    }
    updates.usesAllowedPerUser = usesPerUser;
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.updateOne(
      { id: discountId },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Discount not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Discount updated successfully",
      }),
    };
  } catch (err) {
    console.error("PUT discount error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// DELETE: remove a discount by id
async function handleDelete(discountId) {
  if (!discountId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Discount ID required" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.deleteOne({ id: discountId });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Discount not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Discount deleted successfully",
      }),
    };
  } catch (err) {
    console.error("DELETE discount error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const body = event.body;
  const discountId = event.queryStringParameters?.id;
  const isAdminRoute = method !== "OPTIONS" && method !== "GET";

  // CORS headers
  const headers = buildHeaders(isAdminRoute);
  if (method === "GET") {
    headers["Cache-Control"] = "public, s-maxage=60, stale-while-revalidate=30";
  }

  // Handle preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  // GET is public for fetching available discounts; other routes require admin auth
  if (method !== "GET" && !isAdminAuthorized(event.headers)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized: invalid or missing admin token" }),
    };
  }

  let response;

  if (method === "GET") {
    response = await handleGet(event);
  } else if (method === "POST") {
    response = await handlePost(body);
  } else if (method === "PUT") {
    response = await handlePut(body, discountId);
  } else if (method === "DELETE") {
    response = await handleDelete(discountId);
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
