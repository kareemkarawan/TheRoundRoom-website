/**
 * FILE: orders.js
 * PURPOSE: Netlify function for order management including payment verification.
 *
 * NOTES:
 * - POST: Creates order with Razorpay order, validates items/prices server-side
 * - GET: Admin only, fetches orders with optional status/orderType filters
 * - PATCH: Verify payment signature or update order status
 * - DELETE: Admin only, remove order by orderNumber (or all with all=1)
 * - Supports combo items with bagel/schmear selections
 * - Applies discounts if discountId provided and valid
 * - Orders stored in MongoDB round_room.orders collection
 * - Payment verification uses HMAC SHA256 signature check
 */

const { MongoClient, ObjectId } = require("mongodb");
const crypto = require("crypto");
const { isAdminAuthorized } = require("./utils");

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
        isCombo: i.isCombo || false,
        isBox: i.isBox || false,
        bagelId: i.bagelId || null,
        schmearId: i.schmearId || null,
        bagelName: i.bagelName || null,
        schmearName: i.schmearName || null,
        boxName: i.boxName || null,
        bagelCount: i.bagelCount || 0,
        schmearCount: i.schmearCount || 0,
        selectedBagels: i.selectedBagels || [],
        selectedSchmears: i.selectedSchmears || [],
      }))
      .filter((i) => i.menuItemId && i.qty > 0);

    if (requestedItems.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Valid items are required" }),
      };
    }

    // Separate combo items, box items, and regular menu items
    const comboItems = requestedItems.filter((i) => i.isCombo || i.menuItemId === "combo_bagel_schmear");
    const boxItems = requestedItems.filter((i) => i.isBox || i.menuItemId.startsWith("box_"));
    const regularItems = requestedItems.filter((i) => !i.isCombo && !i.isBox && i.menuItemId !== "combo_bagel_schmear" && !i.menuItemId.startsWith("box_"));

    const ids = regularItems.map((i) => i.menuItemId);
    const menuItems = ids.length > 0 ? await menuCollection.find({ id: { $in: ids } }).toArray() : [];
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    let subtotal = 0;
    const lineItems = [];

    // Process regular menu items
    for (const item of regularItems) {
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

    // Process bagel box items
    if (boxItems.length > 0) {
      const boxCollection = db.collection("bagel_boxes");
      const boxIds = boxItems.map((i) => i.menuItemId);
      const boxes = await boxCollection.find({ id: { $in: boxIds } }).toArray();
      const boxMap = new Map(boxes.map((b) => [b.id, b]));

      for (const boxItem of boxItems) {
        const box = boxMap.get(boxItem.menuItemId);
        if (!box) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: `Invalid box id: ${boxItem.menuItemId}` }),
          };
        }
        if (box.isAvailable === false) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: `Box unavailable: ${boxItem.menuItemId}` }),
          };
        }

        const boxPrice = Number(box.price || 0);
        const lineTotal = Number((boxPrice * boxItem.qty).toFixed(2));
        subtotal += lineTotal;

        lineItems.push({
          menuItemId: box.id,
          name: box.name,
          price: boxPrice,
          qty: boxItem.qty,
          lineTotal,
          isBox: true,
          bagelCount: box.bagelCount,
          schmearCount: box.schmearCount,
          selectedBagels: boxItem.selectedBagels || [],
          selectedSchmears: boxItem.selectedSchmears || [],
        });
      }
    }

    // Process combo items
    if (comboItems.length > 0) {
      const comboSettingsCollection = db.collection("combo_settings");
      const comboSettings = await comboSettingsCollection.findOne({ id: "combo" });
      
      if (!comboSettings || !comboSettings.isAvailable) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Combo is currently unavailable" }),
        };
      }

      for (const combo of comboItems) {
        const comboPrice = Number(comboSettings.price || 0);
        const lineTotal = Number((comboPrice * combo.qty).toFixed(2));
        subtotal += lineTotal;
        
        const comboName = combo.bagelName && combo.schmearName 
          ? `Combo: ${combo.bagelName} + ${combo.schmearName}`
          : "Bagel & Schmear Combo";
        
        lineItems.push({
          menuItemId: "combo_bagel_schmear",
          name: comboName,
          price: comboPrice,
          qty: combo.qty,
          lineTotal,
          isCombo: true,
          bagelId: combo.bagelId,
          schmearId: combo.schmearId,
        });
      }
    }

    // Handle discount if provided
    let discountAmount = 0;
    let discountInfo = null;
    if (order.discountId) {
      const discountsCollection = db.collection("discounts");
      const discount = await discountsCollection.findOne({ id: order.discountId, isActive: true });
      if (discount) {
        discountAmount = Number(((subtotal * discount.percentage) / 100).toFixed(2));
        discountInfo = {
          id: discount.id,
          name: discount.name,
          percentage: discount.percentage,
          amount: discountAmount,
        };
      }
    }

    const discountedSubtotal = subtotal - discountAmount;
    const tax = Number(((discountedSubtotal * settings.taxRate) / 100).toFixed(2));
    const total = Number((discountedSubtotal + tax).toFixed(2));
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
      orderType: order.orderType || "delivery",
      items: lineItems,
      pricing: {
        subtotal,
        discount: discountInfo,
        discountedSubtotal,
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
        pricing: {
          subtotal,
          discount: discountInfo,
          discountedSubtotal,
          tax,
          total,
        },
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
async function handleGet(event) {
  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Build filter from query params
    const params = event.queryStringParameters || {};
    const filter = {};
    
    if (params.orderType) {
      filter.orderType = params.orderType;
    }
    
    if (params.status) {
      const statuses = params.status.split(',').map(s => s.trim());
      filter.status = { $in: statuses };
    }

    const orders = await collection
      .find(filter)
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

      // Remove one discount use from user if discount was applied
      if (orderDoc?.pricing?.discount?.id && orderDoc?.customer?.email) {
        try {
          const usersCollection = db.collection("users");
          const userEmail = orderDoc.customer.email.toLowerCase().trim();
          const discountIdUsed = orderDoc.pricing.discount.id;
          
          // Find user and remove exactly one matching discount entry
          const user = await usersCollection.findOne({ email: userEmail });
          if (user && Array.isArray(user.discounts)) {
            const discountIndex = user.discounts.findIndex(d => d.discountId === discountIdUsed);
            if (discountIndex !== -1) {
              // Remove the discount at that index
              await usersCollection.updateOne(
                { email: userEmail },
                { $unset: { [`discounts.${discountIndex}`]: 1 } }
              );
              // Clean up null values
              await usersCollection.updateOne(
                { email: userEmail },
                { $pull: { discounts: null } }
              );
            }
          }
        } catch (discountErr) {
          console.error("Error removing discount from user:", discountErr);
          // Don't fail the payment verification if discount removal fails
        }
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
  if (orderNumber === "__all__") {
    try {
      const client = await getClient();
      const db = client.db(dbName);
      const collection = db.collection(collectionName);

      const result = await collection.deleteMany({});

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          deletedCount: result.deletedCount,
        }),
      };
    } catch (err) {
      console.error("DELETE all error:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }
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

  if (requiresAdmin && !isAdminAuthorized(event.headers, ADMIN_TOKEN)) {
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
    response = await handleGet(event);
  } else if (method === "PATCH") {
    response = await handlePatch(body, orderNumber);
  } else if (method === "DELETE") {
    const isDeleteAll = event.queryStringParameters?.all === "1";
    response = await handleDelete(isDeleteAll ? "__all__" : orderNumber);
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
