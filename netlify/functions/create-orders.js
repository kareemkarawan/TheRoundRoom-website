const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const menuCollection = "menu";
const settingsCollection = "settings";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  cachedClient = client;
  return client;
}

async function getSettings(db) {
  const collection = db.collection(settingsCollection);
  const settings = await collection.findOne({ key: "store" });
  return {
    taxRate: Number(settings?.taxRate ?? 5),
    currency: settings?.currency || "INR",
    invoicePrefix: settings?.invoicePrefix || "ORD",
  };
}

function buildResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return buildResponse(200, {});
  }

  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return buildResponse(500, { error: "Razorpay keys not configured" });
  }

  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch (e) {
    return buildResponse(400, { error: "Invalid JSON" });
  }

  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return buildResponse(400, { error: "Items are required" });
  }

  const items = payload.items.map((i) => ({
    id: String(i.id || "").trim(),
    qty: Number(i.qty || 0),
  })).filter(i => i.id && i.qty > 0);

  if (items.length === 0) {
    return buildResponse(400, { error: "Valid items are required" });
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(menuCollection);
    const settings = await getSettings(db);

    const ids = items.map(i => i.id);
    const menuItems = await collection.find({ id: { $in: ids } }).toArray();
    const priceMap = new Map(menuItems.map(m => [m.id, Number(m.price)]));

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      if (!priceMap.has(item.id)) {
        return buildResponse(400, { error: `Invalid item id: ${item.id}` });
      }
      const price = Number(priceMap.get(item.id));
      const lineTotal = price * item.qty;
      subtotal += lineTotal;
      lineItems.push({ id: item.id, qty: item.qty, price, lineTotal });
    }

    const tax = Number(((subtotal * settings.taxRate) / 100).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
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
        },
      }),
    });

    const razorpayData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      console.error("Razorpay order creation failed", {
        status: razorpayRes.status,
        details: razorpayData,
      });
      return buildResponse(400, { error: "Razorpay order creation failed", details: razorpayData });
    }

    return buildResponse(200, {
      orderId: razorpayData.id,
      amount: razorpayData.amount,
      currency: razorpayData.currency,
      receipt: razorpayData.receipt,
      keyId: RAZORPAY_KEY_ID,
      breakdown: { subtotal, tax, total },
      items: lineItems,
    });
  } catch (err) {
    return buildResponse(500, { error: err.message });
  }
};
