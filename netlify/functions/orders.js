const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "orders";

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

// POST: save a new order
async function handlePost(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let order;
  try {
    order = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  // Validate required fields
  if (!order.id || !order.customer || !order.items || !order.total) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required fields: id, customer, items, total",
      }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Insert the order with a timestamp
    const result = await collection.insertOne({
      ...order,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        id: result.insertedId,
        message: "Order saved successfully",
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

// GET: fetch all orders
async function handleGet() {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const orders = await collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return {
      statusCode: 200,
      body: JSON.stringify(orders),
    };
  } catch (err) {
    console.error("GET error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// PATCH: update order status by order ID
async function handlePatch(body, orderId) {
  if (!orderId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Order ID required" }),
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
      { id: orderId },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Order not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Order updated successfully",
      }),
    };
  } catch (err) {
    console.error("PATCH error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// DELETE: remove an order by id
async function handleDelete(orderId) {
  if (!orderId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Order ID required" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.deleteOne({ id: orderId });

    if (result.deletedCount === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Order not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Order deleted successfully",
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
  const orderId = event.queryStringParameters?.id;

  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  let response;

  if (method === "POST") {
    response = await handlePost(body);
  } else if (method === "GET") {
    response = await handleGet();
  } else if (method === "PATCH") {
    response = await handlePatch(body, orderId);
  } else if (method === "DELETE") {
    response = await handleDelete(orderId);
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
