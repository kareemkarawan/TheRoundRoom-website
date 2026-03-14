/**
 * FILE: bagel-boxes.js
 * PURPOSE: Netlify function for CRUD operations on bagel box sets.
 *
 * NOTES:
 * - GET: Public, returns all bagel boxes (only available ones with activeOnly=true)
 * - POST: Admin only, creates new box with id, name, bagelCount, schmearCount, price
 * - PUT: Admin only, updates box by id query param
 * - DELETE: Admin only, removes box by id query param
 * - Admin routes require x-admin-token header
 * - Stored in MongoDB round_room.bagel_boxes collection
 */

const { MongoClient } = require("mongodb");
const { isAdminAuthorized } = require("./utils");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "bagel_boxes";
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
  const cacheControl = isAdminRoute 
    ? "no-store, no-cache, must-revalidate" 
    : "public, max-age=60, stale-while-revalidate=300";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    "Cache-Control": cacheControl,
  };
}

// GET: fetch all bagel boxes
async function handleGet(event) {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const params = event.queryStringParameters || {};
    const filter = params.activeOnly === "true" ? { isAvailable: true } : {};
    const boxes = await collection.find(filter).sort({ sortOrder: 1, createdAt: 1 }).toArray();

    return {
      statusCode: 200,
      body: JSON.stringify(boxes),
    };
  } catch (err) {
    console.error("GET bagel-boxes error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// POST: add a new bagel box (admin only)
async function handlePost(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let box;
  try {
    box = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const priceValue = Number(box.price);
  const bagelCount = Number(box.bagelCount);
  const schmearCount = Number(box.schmearCount);
  const availability = typeof box.isAvailable === "boolean" ? box.isAvailable : true;

  // Validate required fields
  if (!box.id || !box.name || Number.isNaN(priceValue) || Number.isNaN(bagelCount) || Number.isNaN(schmearCount)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required fields: id, name, price, bagelCount, schmearCount",
      }),
    };
  }

  if (bagelCount < 1 || schmearCount < 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "bagelCount must be at least 1, schmearCount must be 0 or more" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Check if box ID already exists
    const existing = await collection.findOne({ id: box.id });
    if (existing) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Box with this ID already exists" }),
      };
    }

    const now = new Date();
    const result = await collection.insertOne({
      id: box.id,
      name: box.name,
      description: box.description || "",
      bagelCount,
      schmearCount,
      price: priceValue,
      isAvailable: availability,
      sortOrder: Number(box.sortOrder) || 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        id: result.insertedId,
        message: "Bagel box added successfully",
      }),
    };
  } catch (err) {
    console.error("POST bagel-boxes error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// PUT: update a bagel box by id
async function handlePut(body, boxId) {
  if (!boxId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Box ID required" }),
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

  // Validate price if provided
  if (updates.price !== undefined) {
    const priceValue = Number(updates.price);
    if (Number.isNaN(priceValue) || priceValue < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid price value" }),
      };
    }
    updates.price = priceValue;
  }

  // Validate counts if provided
  if (updates.bagelCount !== undefined) {
    const val = Number(updates.bagelCount);
    if (Number.isNaN(val) || val < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "bagelCount must be at least 1" }),
      };
    }
    updates.bagelCount = val;
  }

  if (updates.schmearCount !== undefined) {
    const val = Number(updates.schmearCount);
    if (Number.isNaN(val) || val < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "schmearCount must be 0 or more" }),
      };
    }
    updates.schmearCount = val;
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.id;
    delete updates.createdAt;

    updates.updatedAt = new Date();

    const result = await collection.updateOne({ id: boxId }, { $set: updates });

    if (result.matchedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Box not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Box updated" }),
    };
  } catch (err) {
    console.error("PUT bagel-boxes error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// DELETE: remove a bagel box by id
async function handleDelete(boxId) {
  if (!boxId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Box ID required" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.deleteOne({ id: boxId });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Box not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Box deleted" }),
    };
  } catch (err) {
    console.error("DELETE bagel-boxes error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const headers = event.headers || {};
  const params = event.queryStringParameters || {};
  const isAdmin = method !== "GET";

  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: buildHeaders(true),
      body: "",
    };
  }

  // Admin routes require token
  if (isAdmin && !isAdminAuthorized(headers, ADMIN_TOKEN)) {
    return {
      statusCode: 401,
      headers: buildHeaders(true),
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  let result;

  switch (method) {
    case "GET":
      result = await handleGet(event);
      break;
    case "POST":
      result = await handlePost(event.body);
      break;
    case "PUT":
      result = await handlePut(event.body, params.id);
      break;
    case "DELETE":
      result = await handleDelete(params.id);
      break;
    default:
      result = {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
  }

  return {
    ...result,
    headers: buildHeaders(isAdmin),
  };
};
