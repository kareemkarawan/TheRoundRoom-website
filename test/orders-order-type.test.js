const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function loadOrdersHandler(settings) {
    const envKeys = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
    const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalLoad = Module._load;
    const ordersPath = require.resolve("../netlify/functions/orders");
    let mongoClientCreations = 0;

    process.env.RAZORPAY_KEY_ID = "test-key-id";
    process.env.RAZORPAY_KEY_SECRET = "test-key-secret";

    const database = {
        collection(name) {
            return {
                findOne: async () => name === "settings" ? settings : null,
            };
        },
    };

    class FakeMongoClient {
        async connect() { }
        db() { return database; }
    }

    Module._load = function (request, parent, isMain) {
        if (request === "../mongo-uri" && parent?.filename === ordersPath) {
            return {
                createMongoClient: () => {
                    mongoClientCreations += 1;
                    return new FakeMongoClient();
                },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[ordersPath];
    const handler = require(ordersPath).handler;
    Module._load = originalLoad;

    return {
        handler,
        getMongoClientCreations: () => mongoClientCreations,
        cleanup() {
            delete require.cache[ordersPath];
            for (const [key, value] of Object.entries(originalEnv)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        },
    };
}

function createOrderRequest(orderType) {
    return {
        httpMethod: "POST",
        body: JSON.stringify({
            customer: { name: "Test Customer" },
            items: [{ menuItemId: "test-item", qty: 1 }],
            orderType,
        }),
    };
}

test("rejects unsupported order types before database access", async () => {
    const { handler, getMongoClientCreations, cleanup } = loadOrdersHandler({ collectionEnabled: true });

    try {
        const response = await handler(createOrderRequest("popup"));

        assert.equal(response.statusCode, 400);
        assert.equal(JSON.parse(response.body).error, "Invalid order type");
        assert.equal(getMongoClientCreations(), 0);
    } finally {
        cleanup();
    }
});

test("rejects collection orders when the store has disabled them", async () => {
    const { handler, cleanup } = loadOrdersHandler({ collectionEnabled: false, storeOpen: true });

    try {
        const response = await handler(createOrderRequest("collection"));

        assert.equal(response.statusCode, 403);
        assert.equal(JSON.parse(response.body).error, "Collection orders are currently unavailable");
    } finally {
        cleanup();
    }
});