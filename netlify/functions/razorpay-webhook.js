const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";
const collectionName = "orders";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  cachedClient = client;
  return client;
}

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET || !signature || !rawBody) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const rawBody = event.body || "";
  const signature = event.headers["x-razorpay-signature"] || event.headers["X-Razorpay-Signature"];

  if (!verifySignature(rawBody, signature)) {
    console.error("Razorpay webhook signature mismatch");
    return { statusCode: 400, body: "Invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    console.error("Razorpay webhook invalid JSON", e);
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const eventType = payload?.event;
  const entity = payload?.payload?.payment?.entity;
  const razorpayOrderId = entity?.order_id;
  const razorpayPaymentId = entity?.id;
  const amount = entity?.amount;
  const currency = entity?.currency;

  if (!razorpayOrderId) {
    console.error("Razorpay webhook missing order_id", payload?.event);
    return { statusCode: 400, body: "Missing order_id" };
  }

  try {
    const client = await getClient();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const orderDoc = await collection.findOne({ "payment.providerOrderId": razorpayOrderId });
    if (!orderDoc) {
      console.error("Webhook order not found", razorpayOrderId);
      return { statusCode: 404, body: "Order not found" };
    }

    const expectedAmount = Math.round(Number(orderDoc?.pricing?.total || 0) * 100);
    if (Number(orderDoc?.payment?.amount) !== expectedAmount) {
      console.error("Webhook amount mismatch", {
        orderNumber: orderDoc?.orderNumber,
        expectedAmount,
        storedAmount: orderDoc?.payment?.amount,
      });
      return { statusCode: 400, body: "Amount mismatch" };
    }

    if (eventType === "payment.captured") {
      await collection.updateOne(
        { "payment.providerOrderId": razorpayOrderId },
        {
          $set: {
            status: "PAID",
            payment: {
              provider: "razorpay",
              providerOrderId: razorpayOrderId,
              providerPaymentId: razorpayPaymentId,
              method: "Online",
              status: "PAID",
              amount,
              currency: currency || orderDoc?.payment?.currency || "INR",
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
                razorpay_order_id: razorpayOrderId,
                razorpay_payment_id: razorpayPaymentId,
                source: "webhook",
              },
            },
          },
        }
      );
    } else if (eventType === "payment.failed") {
      await collection.updateOne(
        { "payment.providerOrderId": razorpayOrderId },
        {
          $set: {
            status: "PAYMENT_PENDING",
            payment: {
              provider: "razorpay",
              providerOrderId: razorpayOrderId,
              providerPaymentId: razorpayPaymentId || null,
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
                razorpay_order_id: razorpayOrderId,
                razorpay_payment_id: razorpayPaymentId || null,
                source: "webhook",
              },
            },
          },
        }
      );
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("Razorpay webhook error", err);
    return { statusCode: 500, body: "Server error" };
  }
};
