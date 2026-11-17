const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function loadOrdersHandler(settings, menuItems = []) {
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
                find: (query) => ({
                    toArray: async () => menuItems.filter((item) => query.id.$in.includes(item.id)),
                }),
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

function createCarbiesOrderRequest(items, orderDate) {
    return {
        httpMethod: "POST",
        body: JSON.stringify({
            customer: { name: "Test Customer" },
            items,
            orderType: "delivery",
            ...(orderDate ? { orderDate } : {}),
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

test("rejects Carbies Schmear orders without a supported weekday date", async () => {
    const menuItems = [{ id: "carbies-schmear", category: "carbies", isAvailable: true, price: 180 }];
    const { handler, cleanup } = loadOrdersHandler({ storeOpen: true }, menuItems);

    try {
        for (const orderDate of ["2026-11-17", undefined]) {
            const response = await handler(createCarbiesOrderRequest(
                [{ menuItemId: "carbies-schmear", qty: 1 }],
                orderDate
            ));

            assert.equal(response.statusCode, 400);
            assert.match(JSON.parse(response.body).error, /Wednesday, Saturday, and Sunday/);
        }
    } finally {
        cleanup();
    }
});

test("rejects Carbies combo orders without a supported date even if combo type is omitted", async () => {
    const menuItems = [
        { id: "bagel", category: "bagels", isAvailable: true, price: 100 },
        { id: "carbies-schmear", category: "carbies", isAvailable: true, price: 180 },
    ];
    const { handler, cleanup } = loadOrdersHandler({ storeOpen: true }, menuItems);

    try {
        const response = await handler(createCarbiesOrderRequest([{
            menuItemId: "combo-id",
            qty: 1,
            isCombo: true,
            bagelId: "bagel",
            schmearId: "carbies-schmear",
        }], "2026-11-17"));

        assert.equal(response.statusCode, 400);
        assert.match(JSON.parse(response.body).error, /Wednesday, Saturday, and Sunday/);
    } finally {
        cleanup();
    }
});