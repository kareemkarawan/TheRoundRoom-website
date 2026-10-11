const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { createHandler } = require("../netlify/functions/verify-payment");

const secret = "test-razorpay-key-secret";

function createOrder(overrides = {}) {
    return {
        orderNumber: "ORD-test-order",
        status: "PAYMENT_PENDING",
        pricing: { total: 25, currency: "INR" },
        payment: {
            provider: "razorpay",
            providerOrderId: "order_test123",
            providerPaymentId: null,
            status: "CREATED",
            amount: 2500,
            currency: "INR",
        },
        events: [],
        ...overrides,
    };
}

function createRequest(overrides = {}) {
    const payload = {
        razorpay_order_id: "order_test123",
        razorpay_payment_id: "pay_test123",
        orderNumber: "ORD-test-order",
        ...overrides,
    };
    payload.razorpay_signature = crypto
        .createHmac("sha256", secret)
        .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
        .digest("hex");

    return {
        httpMethod: "POST",
        body: JSON.stringify(payload),
    };
}

function createPaymentHandler(order, options = {}) {
    let databaseCalls = 0;
    let updateCalls = 0;
    const collection = {
        async findOne(filter) {
            if (
                filter.orderNumber === order.orderNumber &&
                filter["payment.providerOrderId"] === order.payment.providerOrderId
            ) {
                return order;
            }
            return null;
        },
        async updateOne(filter, update) {
            updateCalls += 1;
            if (options.beforeUpdate) {
                await options.beforeUpdate(order, filter, update);
            }
            if (order.payment.status === "PAID") return { matchedCount: 0 };

            order.status = update.$set.status;
            for (const [path, value] of Object.entries(update.$set)) {
                if (path.startsWith("payment.")) {
                    order.payment[path.slice("payment.".length)] = value;
                }
            }
            order.events.push(update.$push.events);
            return { matchedCount: 1 };
        },
    };
    const handler = createHandler({
        getDatabase: async () => {
            databaseCalls += 1;
            return { collection: () => collection };
        },
        keySecret: secret,
    });

    return { handler, getDatabaseCalls: () => databaseCalls, getUpdateCalls: () => updateCalls };
}

async function invoke(handler, event = createRequest()) {
    const response = await handler(event);
    return { response, body: JSON.parse(response.body) };
}

test("valid signature verifies payment and marks matching order paid", async () => {
    const order = createOrder();
    const { handler } = createPaymentHandler(order);

    const { response, body } = await invoke(handler);

    assert.equal(response.statusCode, 200);
    assert.equal(body.success, true);
    assert.equal(order.status, "PAID");
    assert.equal(order.payment.providerPaymentId, "pay_test123");
    assert.equal(order.payment.status, "PAID");
    assert.equal(order.events[0].details.source, "checkout_verification");
});

test("invalid signature is rejected before database access", async () => {
    const { handler, getDatabaseCalls } = createPaymentHandler(createOrder());
    const request = createRequest();
    const payload = JSON.parse(request.body);
    payload.razorpay_signature = "0".repeat(64);
    request.body = JSON.stringify(payload);

    const { response, body } = await invoke(handler, request);

    assert.equal(response.statusCode, 400);
    assert.equal(body.error, "Invalid payment signature");
    assert.equal(getDatabaseCalls(), 0);
});

test("order number must match the signed Razorpay order", async () => {
    const { handler } = createPaymentHandler(createOrder());

    const { response } = await invoke(handler, createRequest({ orderNumber: "ORD-other-order" }));

    assert.equal(response.statusCode, 404);
});

test("stored amount and currency must match server-calculated pricing", async () => {
    const order = createOrder({
        payment: {
            provider: "razorpay",
            providerOrderId: "order_test123",
            providerPaymentId: null,
            status: "CREATED",
            amount: 2400,
            currency: "INR",
        },
    });
    const { handler, getUpdateCalls } = createPaymentHandler(order);

    const { response, body } = await invoke(handler);

    assert.equal(response.statusCode, 409);
    assert.equal(body.error, "Stored payment details do not match the order");
    assert.equal(getUpdateCalls(), 0);
    assert.equal(order.status, "PAYMENT_PENDING");
});

test("stored currency must match server-calculated pricing", async () => {
    const order = createOrder({
        payment: {
            provider: "razorpay",
            providerOrderId: "order_test123",
            providerPaymentId: null,
            status: "CREATED",
            amount: 2500,
            currency: "USD",
        },
    });
    const { handler, getUpdateCalls } = createPaymentHandler(order);

    const { response } = await invoke(handler);

    assert.equal(response.statusCode, 409);
    assert.equal(getUpdateCalls(), 0);
    assert.equal(order.status, "PAYMENT_PENDING");
});

test("repeated verification for the same payment is idempotent", async () => {
    const order = createOrder({
        status: "PAID",
        payment: {
            provider: "razorpay",
            providerOrderId: "order_test123",
            providerPaymentId: "pay_test123",
            status: "PAID",
            amount: 2500,
            currency: "INR",
        },
    });
    const { handler, getUpdateCalls } = createPaymentHandler(order);

    const { response, body } = await invoke(handler);

    assert.equal(response.statusCode, 200);
    assert.equal(body.alreadyVerified, true);
    assert.equal(getUpdateCalls(), 0);
});

test("a second payment cannot replace a payment already recorded as paid", async () => {
    const order = createOrder({
        status: "PAID",
        payment: {
            provider: "razorpay",
            providerOrderId: "order_test123",
            providerPaymentId: "pay_original",
            status: "PAID",
            amount: 2500,
            currency: "INR",
        },
    });
    const { handler } = createPaymentHandler(order);

    const { response } = await invoke(handler);

    assert.equal(response.statusCode, 409);
    assert.equal(order.payment.providerPaymentId, "pay_original");
});

test("verification succeeds when a concurrent update records the same payment", async () => {
    const order = createOrder();
    const { handler } = createPaymentHandler(order, {
        beforeUpdate: async (currentOrder) => {
            currentOrder.status = "PAID";
            currentOrder.payment.status = "PAID";
            currentOrder.payment.providerPaymentId = "pay_test123";
        },
    });

    const { response, body } = await invoke(handler);

    assert.equal(response.statusCode, 200);
    assert.equal(body.alreadyVerified, true);
});