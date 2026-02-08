const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "pincodes";
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

// GET: fetch all pincodes
async function handleGet() {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const pincodes = await collection.find({}).toArray();

    return {
      statusCode: 200,
      body: JSON.stringify(pincodes),
    };
  } catch (err) {
    console.error("GET error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// POST: add a new pincode
async function handlePost(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let pincode;
  try {
    pincode = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  // Validate required fields
  if (!pincode.code) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required field: code",
      }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.insertOne({
      ...pincode,
      createdAt: new Date(),
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        id: result.insertedId,
        message: "Pincode added successfully",
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

// PUT: update a pincode
async function handlePut(body, pincodeId) {
  if (!pincodeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Pincode ID required" }),
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
      { code: pincodeId },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Pincode not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Pincode updated successfully",
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

// DELETE: remove a pincode
async function handleDelete(pincodeId) {
  if (!pincodeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Pincode ID required" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.deleteOne({ code: pincodeId });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Pincode not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Pincode deleted successfully",
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
  const pincodeId = event.queryStringParameters?.id;
  const isAdminRoute = method !== "GET" && method !== "OPTIONS";

  // CORS headers
  const headers = buildHeaders(isAdminRoute);

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
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  let response;

  if (method === "GET") {
    response = await handleGet();
  } else if (method === "POST") {
    response = await handlePost(body);
  } else if (method === "PUT") {
    response = await handlePut(body, pincodeId);
  } else if (method === "DELETE") {
    response = await handleDelete(pincodeId);
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
