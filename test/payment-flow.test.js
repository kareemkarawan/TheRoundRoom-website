const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const test = require("node:test");
const { createHandler: createPaymentHandler } = require("../netlify/functions/verify-payment");

const keySecret = "test-razorpay-key-secret";

function getPath(value, path) {
    return path.split(".").reduce((current, key) => current?.[key], value);
}

function matches(document, filter) {
    return Object.entries(filter).every(([path, expected]) => {
        const actual = getPath(document, path);
        if (expected && typeof expected === "object" && "$ne" in expected) {
            return actual !== expected.$ne;
        }
        return actual === expected;
    });
}

function setPath(value, path, nextValue) {
    const parts = path.split(".");
    const key = parts.pop();
    const parent = parts.reduce((current, part) => current[part] ||= {}, value);
    parent[key] = nextValue;
}

function createDatabase() {
    const orders = [];
    const settings = {
        key: "store",
        taxRate: 0,
        currency: "INR",
        invoicePrefix: "TEST",
        storeOpen: true,
        deliveryFee: 0,
    };
    const menuItems = [{ id: "test-bagel", name: "Test Bagel", price: 100, isAvailable: true }];

    return {
        orders,
        collection(name) {
            if (name === "settings") {
                return { findOne: async () => settings };
            }
            if (name === "menu") {
                return { find: () => ({ toArray: async () => menuItems }) };
            }
            if (name === "orders") {
                return {
                    insertOne: async (order) => {
                        orders.push(order);
                        return { insertedId: "test-order-id" };
                    },
                    findOne: async (filter) => orders.find((order) => matches(order, filter)) || null,
                    updateOne: async (filter, update) => {
                        const order = orders.find((candidate) => matches(candidate, filter));
                        if (!order) return { matchedCount: 0 };
                        for (const [path, value] of Object.entries(update.$set || {})) {
                            setPath(order, path, value);
                        }
                        for (const [path, value] of Object.entries(update.$push || {})) {
                            getPath(order, path).push(value);
                        }
                        return { matchedCount: 1 };
                    },
                };
            }
            throw new Error(`Unexpected collection: ${name}`);
        },
    };
}

test("creates an order, verifies payment, and persists the paid confirmation", async () => {
    const envKeys = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
    const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalLoad = Module._load;
    const originalFetch = global.fetch;
    const ordersPath = require.resolve("../netlify/functions/orders");
    const database = createDatabase();
    let razorpayRequest;

    process.env.RAZORPAY_KEY_ID = "test-razorpay-key-id";
    process.env.RAZORPAY_KEY_SECRET = keySecret;
    global.fetch = async (url, options) => {
        assert.equal(url, "https://api.razorpay.com/v1/orders");
        razorpayRequest = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({
                id: "order_test123",
                amount: razorpayRequest.amount,
                currency: razorpayRequest.currency,
            }),
        };
    };

    Module._load = function (request, parent, isMain) {
        if (request === "../mongo-uri" && parent?.filename === ordersPath) {
            return {
                createMongoClient: () => ({
                    connect: async () => { },
                    db: () => database,
                }),
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[ordersPath];

    try {
        const { handler: createOrder } = require(ordersPath);
        const createResponse = await createOrder({
            httpMethod: "POST",
            body: JSON.stringify({
                customer: { name: "Test Customer", email: "customer@example.test" },
                items: [{ menuItemId: "test-bagel", qty: 1 }],
                orderType: "collection",
            }),
        });
        const created = JSON.parse(createResponse.body);

        assert.equal(createResponse.statusCode, 201);
        assert.equal(created.success, true);
        assert.equal(razorpayRequest.amount, 10000);
        assert.equal(razorpayRequest.currency, "INR");
        assert.equal(database.orders.length, 1);

        const pendingOrder = database.orders[0];
        assert.equal(pendingOrder.orderNumber, created.orderNumber);
        assert.equal(pendingOrder.status, "PAYMENT_PENDING");
        assert.equal(pendingOrder.payment.providerOrderId, "order_test123");
        assert.equal(pendingOrder.payment.amount, created.amount);
        assert.equal(pendingOrder.payment.status, "CREATED");
        assert.equal(pendingOrder.pricing.total, created.pricing.total);
        assert.equal(pendingOrder.events[0].type, "ORDER_CREATED");

        const verifyPayment = createPaymentHandler({
            getDatabase: async () => database,
            keySecret,
        });
        const paymentId = "pay_test123";
        const signature = crypto
            .createHmac("sha256", keySecret)
            .update(`order_test123|${paymentId}`)
            .digest("hex");
        const verifyResponse = await verifyPayment({
            httpMethod: "POST",
            body: JSON.stringify({
                razorpay_order_id: "order_test123",
                razorpay_payment_id: paymentId,
                razorpay_signature: signature,
                orderNumber: created.orderNumber,
            }),
        });
        const verified = JSON.parse(verifyResponse.body);
        const savedOrder = await database.collection("orders").findOne({ orderNumber: created.orderNumber });

        assert.equal(verifyResponse.statusCode, 200);
        assert.equal(verified.success, true);
        assert.equal(verified.orderNumber, created.orderNumber);
        assert.equal(savedOrder.status, "PAID");
        assert.equal(savedOrder.payment.status, "PAID");
        assert.equal(savedOrder.payment.providerPaymentId, paymentId);
        assert.equal(savedOrder.payment.method, "Online");
        assert.equal(savedOrder.payment.amount, 10000);
        assert.equal(savedOrder.payment.currency, "INR");
        assert.ok(savedOrder.payment.paidAt instanceof Date);
        assert.equal(savedOrder.events[1].type, "PAYMENT_VERIFIED");
        assert.equal(savedOrder.events[1].details.source, "checkout_verification");
    } finally {
        Module._load = originalLoad;
        global.fetch = originalFetch;
        delete require.cache[ordersPath];
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});