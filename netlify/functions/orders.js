const { MongoClient, ObjectId } = require("mongodb");
const crypto = require("crypto");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "orders";
const menuCollectionName = "menu";
const settingsCollectionName = "settings";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN;

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

async function getSettings(db) {
  const collection = db.collection(settingsCollectionName);
  const settings = await collection.findOne({ key: "store" });
  return {
    taxRate: Number(settings?.taxRate ?? 5),
    currency: settings?.currency || "INR",
    invoicePrefix: settings?.invoicePrefix || "ORD",
    storeOpen: typeof settings?.storeOpen === "boolean" ? settings.storeOpen : true,
    minOrder: Number(settings?.minOrder ?? 0),
  };
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
  if (!order.customer || !order.items || !Array.isArray(order.items) || order.items.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required fields: customer, items",
      }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const menuCollection = db.collection(menuCollectionName);
    const settings = await getSettings(db);

    if (!settings.storeOpen) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Store is currently closed" }),
      };
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Razorpay keys not configured" }),
      };
    }

    const requestedItems = order.items
      .map((i) => ({
        menuItemId: String(i.menuItemId || "").trim(),
        qty: Number(i.qty || 0),
      }))
      .filter((i) => i.menuItemId && i.qty > 0);

    if (requestedItems.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Valid items are required" }),
      };
    }

    const ids = requestedItems.map((i) => i.menuItemId);
    const menuItems = await menuCollection.find({ id: { $in: ids } }).toArray();
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    let subtotal = 0;
    const lineItems = [];

    for (const item of requestedItems) {
      const menuItem = menuMap.get(item.menuItemId);
      if (!menuItem) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Invalid menu item id: ${item.menuItemId}` }),
        };
      }
      if (menuItem.isAvailable === false) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Item unavailable: ${item.menuItemId}` }),
        };
      }

      const price = Number(menuItem.price);
      const lineTotal = Number((price * item.qty).toFixed(2));
      subtotal += lineTotal;
      lineItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price,
        qty: item.qty,
        lineTotal,
      });
    }

    const tax = Number(((subtotal * settings.taxRate) / 100).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    const createdAt = new Date();
    const orderNumber = `${settings.invoicePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const amountPaise = Math.round(total * 100);
    const receipt = `rr_${Date.now()}`;
    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: settings.currency,
        receipt,
        notes: {
          source: "the-round-room",
          orderNumber,
        },
      }),
    });

    const razorpayData = await razorpayRes.json();
    if (!razorpayRes.ok) {
      console.error("Razorpay order creation failed", {
        status: razorpayRes.status,
        details: razorpayData,
        orderNumber,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Razorpay order creation failed", details: razorpayData }),
      };
    }

    const orderDoc = {
      orderNumber,
      status: "PAYMENT_PENDING",
      items: lineItems,
      pricing: {
        subtotal,
        tax,
        total,
        currency: settings.currency,
      },
      customer: {
        name: order.customer?.name || "",
        phone: order.customer?.phone || "",
        email: order.customer?.email || "",
        address: order.customer?.address || "",
        note: order.customer?.note || "",
      },
      payment: {
        provider: "razorpay",
        providerOrderId: razorpayData.id,
        providerPaymentId: null,
        method: "Online",
        status: "CREATED",
        amount: razorpayData.amount,
        currency: razorpayData.currency,
        paidAt: null,
      },
      accounting: {
        provider: null,
        invoiceId: null,
        invoiceNumber: null,
        invoiceUrl: null,
        syncedAt: null,
      },
      events: [
        {
          type: "ORDER_CREATED",
          at: createdAt,
          details: { orderNumber },
        },
      ],
      createdAt,
      updatedAt: createdAt,
    };

    // Insert the order with a timestamp
    const result = await collection.insertOne(orderDoc);

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        id: result.insertedId,
        orderNumber,
        razorpay_order_id: razorpayData.id,
        amount: razorpayData.amount,
        currency: razorpayData.currency,
        key_id: RAZORPAY_KEY_ID,
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
async function handlePatch(body, orderNumber) {
  if (!orderNumber) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Order number required" }),
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

  if (updates?.action === "VERIFY_PAYMENT") {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = updates || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing Razorpay verification fields" }),
      };
    }

    if (!RAZORPAY_KEY_SECRET) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Razorpay keys not configured" }),
      };
    }

    const expected = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      console.error("Payment verification mismatch", {
        orderNumber,
        razorpay_order_id,
        razorpay_payment_id,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payment signature" }),
      };
    }

    try {
      const client = await getClient();
      const db = client.db(dbName);
      const collection = db.collection(collectionName);

      const orderDoc = await collection.findOne({ orderNumber });
      if (!orderDoc) {
        console.error("Payment verification failed: order not found", { orderNumber });
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Order not found" }),
        };
      }

      if (orderDoc?.payment?.providerOrderId !== razorpay_order_id) {
        console.error("Payment verification failed: order ID mismatch", {
          orderNumber,
          razorpay_order_id,
          providerOrderId: orderDoc?.payment?.providerOrderId,
        });
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Order ID mismatch" }),
        };
      }

      const expectedAmount = Math.round(Number(orderDoc?.pricing?.total || 0) * 100);
      if (Number(orderDoc?.payment?.amount) !== expectedAmount) {
        console.error("Payment verification failed: amount mismatch", {
          orderNumber,
          expectedAmount,
          storedAmount: orderDoc?.payment?.amount,
        });
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Amount mismatch" }),
        };
      }

      const result = await collection.updateOne(
        { orderNumber, "payment.providerOrderId": razorpay_order_id },
        {
          $set: {
            status: "PAID",
            payment: {
              provider: "razorpay",
              providerOrderId: razorpay_order_id,
              providerPaymentId: razorpay_payment_id,
              method: "Online",
              status: "PAID",
              amount: orderDoc?.payment?.amount,
              currency: orderDoc?.payment?.currency || "INR",
              paidAt: new Date(),
            },
            accounting: {
              provider: null,
              invoiceId: null,
              invoiceNumber: null,
              invoiceUrl: null,
              syncedAt: null,
            },
            updatedAt: new Date(),
          },
          $push: {
            events: {
              type: "PAYMENT_VERIFIED",
              at: new Date(),
              details: {
                razorpay_order_id,
                razorpay_payment_id,
              },
            },
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
        body: JSON.stringify({ success: true, message: "Payment verified" }),
      };
    } catch (err) {
      console.error("PATCH payment error:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  if (updates?.action === "MARK_PAYMENT_FAILED") {
    const { razorpay_order_id, razorpay_payment_id } = updates || {};
    if (!razorpay_order_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing razorpay_order_id" }),
      };
    }

    try {
      const client = await getClient();
      const db = client.db(dbName);
      const collection = db.collection(collectionName);

      const orderDoc = await collection.findOne({ orderNumber });
      if (!orderDoc) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Order not found" }),
        };
      }

      if (orderDoc?.payment?.providerOrderId !== razorpay_order_id) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Order ID mismatch" }),
        };
      }

      const result = await collection.updateOne(
        { orderNumber, "payment.providerOrderId": razorpay_order_id },
        {
          $set: {
            status: "PAYMENT_PENDING",
            payment: {
              provider: "razorpay",
              providerOrderId: razorpay_order_id,
              providerPaymentId: razorpay_payment_id || null,
              method: "Online",
              status: "FAILED",
              amount: orderDoc?.payment?.amount,
              currency: orderDoc?.payment?.currency || "INR",
              paidAt: null,
            },
            updatedAt: new Date(),
          },
          $push: {
            events: {
              type: "PAYMENT_FAILED",
              at: new Date(),
              details: {
                razorpay_order_id,
                razorpay_payment_id: razorpay_payment_id || null,
              },
            },
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
        body: JSON.stringify({ success: true, message: "Payment marked failed" }),
      };
    } catch (err) {
      console.error("PATCH payment failed error:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  const allowedStatuses = [
    "CREATED",
    "PAYMENT_PENDING",
    "PAID",
    "PREPARING",
    "COMPLETED",
    "CANCELLED",
  ];

  const nextStatus = updates?.status;
  if (!nextStatus || !allowedStatuses.includes(nextStatus)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid status" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.updateOne(
      { orderNumber },
      {
        $set: {
          status: nextStatus,
          updatedAt: new Date(),
        },
        $push: {
          events: {
            type: nextStatus === "CANCELLED" ? "ORDER_CANCELLED" : "STATUS_CHANGED",
            at: new Date(),
            details: { status: nextStatus },
          },
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
async function handleDelete(orderNumber) {
  if (!orderNumber) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Order number required" }),
    };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const result = await collection.deleteOne({ orderNumber });

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
  const orderNumber = event.queryStringParameters?.orderNumber || event.queryStringParameters?.id;
  const isAdminRoute = method === "GET" || method === "DELETE";
  const isStatusPatch = method === "PATCH" && !body?.includes("VERIFY_PAYMENT") && !body?.includes("MARK_PAYMENT_FAILED");
  const requiresAdmin = isAdminRoute || isStatusPatch;

  // CORS headers
  const headers = buildHeaders(requiresAdmin);

  // Handle preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (requiresAdmin && !isAdminAuthorized(event.headers)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  let response;

  if (method === "POST") {
    response = await handlePost(body);
  } else if (method === "GET") {
    response = await handleGet();
  } else if (method === "PATCH") {
    response = await handlePatch(body, orderNumber);
  } else if (method === "DELETE") {
    response = await handleDelete(orderNumber);
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
