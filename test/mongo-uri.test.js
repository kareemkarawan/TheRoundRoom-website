const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const { createMongoClient, resolveMongoUri } = require("../netlify/mongo-uri");

function fakeClientConstructor() {
  class FakeMongoClient {
    static instances = [];

    constructor(uri, options) {
      this.uri = uri;
      this.options = options;
      FakeMongoClient.instances.push(this);
    }

    async connect() {
      this.connected = true;
    }
  }

  return FakeMongoClient;
}

test("accepts a production URI without runtime mode variables", () => {
  const uri = "mongodb+srv://cluster.example.invalid/round_room";
  const env = { MONGODB_URI: uri };
  const FakeMongoClient = fakeClientConstructor();

  assert.equal(resolveMongoUri(env), uri);
  const client = createMongoClient({}, env, FakeMongoClient);
  assert.equal(client.uri, uri);
  assert.equal(FakeMongoClient.instances.length, 1);
});

test("rejects malformed MongoDB URIs before client construction", () => {
  const invalidEnvironments = [
    { MONGODB_URI: "mongodb://[::1" },
    { MONGODB_URI: "http://db.example.invalid:27017/round_room" },
    { MONGODB_URI: "mongodb://db.example.invalid/round_room#fragment" },
    { MONGODB_URI: "mongodb+srv://cluster.example.invalid:27017/round_room" },
    { MONGODB_URI: "mongodb://db.example.invalid/round_room/%zz" },
    { MONGODB_URI: undefined },
  ];

  for (const env of invalidEnvironments) {
    const FakeMongoClient = fakeClientConstructor();
    assert.throws(() => createMongoClient({}, env, FakeMongoClient));
    assert.equal(FakeMongoClient.instances.length, 0);
  }
});

test("source-only publish paths are covered by forced 404 redirects", () => {
  const redirects = fs.readFileSync(path.join(__dirname, "..", "_redirects"), "utf8");

  assert.match(redirects, /^\/netlify\/\* \/ 404!$/m);
  assert.match(redirects, /^\/test\/\* \/ 404!$/m);
  assert.match(redirects, /^\/\.env\* \/ 404!$/m);
  assert.match(redirects, /^\/docker-compose\.local\.ya?ml \/ 404!$/m);
  assert.match(redirects, /^\/compose\.local\.ya?ml \/ 404!$/m);
});

test("database paths use MONGODB_URI without runtime mode settings", async () => {
  const envKeys = [
    "LOCAL_DEVELOPMENT",
    "CONTEXT",
    "MONGODB_RUNTIME_MODE",
    "MONGODB_URI",
    "ADMIN_TOKEN",
    "RAZORPAY_WEBHOOK_SECRET",
    "RAZORPAY_KEY_SECRET",
  ];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalLoad = Module._load;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  let constructorCalls = 0;

  class FakeMongoClient {
    constructor(uri) {
      constructorCalls += 1;
      assert.equal(uri, process.env.MONGODB_URI);
    }

    async connect() {
      throw new Error("test connection failure");
    }

    async close() {
    }
  }

  const functionDirectory = path.join(__dirname, "..", "netlify", "functions");
  const functionFiles = [
    "audit.js",
    "orders.js",
    "pincodes.js",
    "razorpay-webhook.js",
    "room-db.js",
    "verify-payment.js",
  ];

  try {
    process.env.MONGODB_URI = "mongodb+srv://cluster.example.invalid/round_room";
    process.env.ADMIN_TOKEN = "test-admin-token";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.RAZORPAY_KEY_SECRET = "test-razorpay-key-secret";
    delete process.env.LOCAL_DEVELOPMENT;
    delete process.env.CONTEXT;
    delete process.env.MONGODB_RUNTIME_MODE;

    Module._load = function (request, parent, isMain) {
      if (request === "mongodb") {
        return { MongoClient: FakeMongoClient, ObjectId: class FakeObjectId { } };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    console.error = () => { };
    console.warn = () => { };
    delete require.cache[require.resolve("../netlify/mongo-uri")];
    const { getDB } = require("../netlify/functions/db");
    await assert.rejects(getDB(), /Database connection failed: test connection failure/);

    for (const file of functionFiles) {
      const modulePath = path.join(functionDirectory, file);
      delete require.cache[require.resolve(modulePath)];
      const { handler } = require(modulePath);
      const event = { httpMethod: "GET", headers: { "x-admin-token": "test-admin-token" } };

      if (file === "razorpay-webhook.js") {
        const crypto = require("node:crypto");
        const body = JSON.stringify({
          event: "payment.captured",
          payload: { payment: { entity: { order_id: "test-order" } } },
        });
        event.httpMethod = "POST";
        event.body = body;
        event.headers["x-razorpay-signature"] = crypto
          .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
          .update(body)
          .digest("hex");
      }

      if (file === "verify-payment.js") {
        const crypto = require("node:crypto");
        const paymentDetails = {
          razorpay_order_id: "order_test123",
          razorpay_payment_id: "pay_test123",
          orderNumber: "test-order",
        };
        paymentDetails.razorpay_signature = crypto
          .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(`${paymentDetails.razorpay_order_id}|${paymentDetails.razorpay_payment_id}`)
          .digest("hex");
        event.httpMethod = "POST";
        event.body = JSON.stringify(paymentDetails);
      }

      const response = await handler(event);
      assert.equal(response.statusCode, 500, `${file} should report the simulated connection failure`);
    }

    const roomDb = require("../netlify/functions/room-db");
    const roomDbResponse = await roomDb.handler({});
    assert.equal(roomDbResponse.statusCode, 500);
    assert.equal(constructorCalls, functionFiles.length + 2);
  } finally {
    Module._load = originalLoad;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const file of ["db.js", ...functionFiles]) {
      const modulePath = path.join(functionDirectory, file);
      delete require.cache[require.resolve(modulePath)];
    }
    delete require.cache[require.resolve("../netlify/mongo-uri")];
  }
});