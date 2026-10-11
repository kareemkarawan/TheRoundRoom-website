const crypto = require("crypto");
const { getDB } = require("./db");

const collectionName = "orders";

function buildResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        body: JSON.stringify(body),
    };
}

function verifySignature(orderId, paymentId, signature, secret) {
    if (
        !secret ||
        typeof orderId !== "string" ||
        typeof paymentId !== "string" ||
        typeof signature !== "string" ||
        !/^[a-f0-9]{64}$/i.test(signature)
    ) {
        return false;
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest();
    const received = Buffer.from(signature, "hex");
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function createHandler({ getDatabase = getDB, keySecret = process.env.RAZORPAY_KEY_SECRET } = {}) {
    return async (event) => {
        if (event.httpMethod === "OPTIONS") {
            return buildResponse(200, {});
        }

        if (event.httpMethod !== "POST") {
            return buildResponse(405, { error: "Method not allowed" });
        }

        if (!keySecret) {
            console.error("Razorpay key secret is not configured");
            return buildResponse(500, { error: "Payment verification is not configured" });
        }

        let payload;
        try {
            payload = event.body ? JSON.parse(event.body) : null;
        } catch (err) {
            return buildResponse(400, { error: "Invalid JSON" });
        }

        const orderId = payload?.razorpay_order_id;
        const paymentId = payload?.razorpay_payment_id;
        const signature = payload?.razorpay_signature;
        const orderNumber = typeof payload?.orderNumber === "string" ? payload.orderNumber.trim() : "";

        if (!orderId || !paymentId || !signature || !orderNumber) {
            return buildResponse(400, { error: "Payment details are required" });
        }

        if (!verifySignature(orderId, paymentId, signature, keySecret)) {
            return buildResponse(400, { error: "Invalid payment signature" });
        }

        try {
            const db = await getDatabase();
            const collection = db.collection(collectionName);
            const orderFilter = {
                orderNumber,
                "payment.provider": "razorpay",
                "payment.providerOrderId": orderId,
            };
            const order = await collection.findOne(orderFilter);

            if (!order) {
                return buildResponse(404, { error: "Matching order not found" });
            }

            const expectedAmount = Math.round(Number(order.pricing?.total) * 100);
            const storedAmount = Number(order.payment?.amount);
            const pricingCurrency = order.pricing?.currency;
            const paymentCurrency = order.payment?.currency;

            if (
                !Number.isSafeInteger(expectedAmount) ||
                expectedAmount <= 0 ||
                storedAmount !== expectedAmount ||
                !pricingCurrency ||
                paymentCurrency !== pricingCurrency
            ) {
                console.error("Stored payment details do not match order pricing", { orderNumber });
                return buildResponse(409, { error: "Stored payment details do not match the order" });
            }

            if (order.payment.status === "PAID") {
                if (order.payment.providerPaymentId === paymentId) {
                    return buildResponse(200, { success: true, orderNumber, alreadyVerified: true });
                }
                return buildResponse(409, { error: "Order has already been paid with another payment" });
            }

            const verifiedAt = new Date();
            const result = await collection.updateOne(
                { ...orderFilter, "payment.status": { $ne: "PAID" } },
                {
                    $set: {
                        status: "PAID",
                        "payment.providerPaymentId": paymentId,
                        "payment.method": "Online",
                        "payment.status": "PAID",
                        "payment.amount": storedAmount,
                        "payment.currency": paymentCurrency,
                        "payment.paidAt": verifiedAt,
                        updatedAt: verifiedAt,
                    },
                    $push: {
                        events: {
                            type: "PAYMENT_VERIFIED",
                            at: verifiedAt,
                            details: {
                                razorpay_order_id: orderId,
                                razorpay_payment_id: paymentId,
                                source: "checkout_verification",
                            },
                        },
                    },
                }
            );

            if (result.matchedCount === 0) {
                const latestOrder = await collection.findOne(orderFilter);
                if (
                    latestOrder?.payment?.status === "PAID" &&
                    latestOrder.payment.providerPaymentId === paymentId
                ) {
                    return buildResponse(200, { success: true, orderNumber, alreadyVerified: true });
                }
                return buildResponse(409, { error: "Order payment state changed; please contact support" });
            }

            return buildResponse(200, { success: true, orderNumber });
        } catch (err) {
            console.error("Payment verification error", err);
            return buildResponse(500, { error: "Could not verify payment" });
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;