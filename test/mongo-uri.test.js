const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const { createMongoClient, resolveMongoUri } = require("../netlify/mongo-uri");

function localEnvironment(overrides = {}) {
  return {
    LOCAL_DEVELOPMENT: "true",
    CONTEXT: "dev",
    MONGODB_URI: "mongodb://127.0.0.1:27018/round_room_local",
    ...overrides,
  };
}

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

test("accepts only the configured local MongoDB URI", () => {
  const uri = "mongodb://127.0.0.1:27018/round_room_local";

  assert.equal(resolveMongoUri(localEnvironment({ MONGODB_URI: uri })), uri);
});

test("rejects unsafe local URIs before client construction", () => {
  const invalidEnvironments = [
    localEnvironment({ MONGODB_URI: "mongodb://db.example.invalid:27017/round_room" }),
    localEnvironment({ MONGODB_URI: "mongodb+srv://cluster.example.invalid/round_room" }),
    localEnvironment({ MONGODB_URI: "mongodb://[::1" }),
    localEnvironment({ MONGODB_URI: "mongodb://localhost:27018/round_room_local" }),
    localEnvironment({ MONGODB_URI: "mongodb://127.0.0.1:27017/round_room_local" }),
    localEnvironment({ MONGODB_URI: "mongodb://127.0.0.1:27018/round_room" }),
    localEnvironment({ MONGODB_URI: undefined }),
  ];

  for (const env of invalidEnvironments) {
    const FakeMongoClient = fakeClientConstructor();
    assert.throws(() => createMongoClient({}, env, FakeMongoClient));
    assert.equal(FakeMongoClient.instances.length, 0);
  }
});

test("rejects ambiguous metadata-only and conflicting runtime environments", () => {
  const remoteUri = "mongodb+srv://cluster.example.invalid/round_room";
  const cases = [
    {
      description: "local CLI metadata without CONTEXT",
      env: {
        MONGODB_URI: remoteUri,
        URL: "https://example.netlify.app",
        SITE_NAME: "example",
        SITE_ID: "site-id",
      },
    },
    {
      description: "local CLI production context",
      env: {
        ...localEnvironment({ MONGODB_URI: remoteUri }),
        CONTEXT: "production",
      },
    },
    {
      description: "development context without explicit local mode",
      env: { MONGODB_URI: remoteUri, CONTEXT: "dev" },
    },
  ];

  for (const { description, env } of cases) {
    assert.throws(() => resolveMongoUri(env), undefined, description);
  }
});

test("requires an explicit server-side mode for production URIs", () => {
  const uri = "mongodb+srv://cluster.example.invalid/round_room";
  const env = {
    MONGODB_URI: uri,
    MONGODB_RUNTIME_MODE: "netlify-production",
    URL: "https://example.netlify.app",
    SITE_NAME: "example",
    SITE_ID: "site-id",
  };
  const FakeMongoClient = fakeClientConstructor();

  const client = createMongoClient({ serverSelectionTimeoutMS: 5000 }, env, FakeMongoClient);

  assert.equal(client.uri, uri);
  assert.equal(FakeMongoClient.instances.length, 1);
  assert.equal(client.connected, undefined);
});

test("source-only publish paths are covered by forced 404 redirects", () => {
  const redirects = fs.readFileSync(path.join(__dirname, "..", "_redirects"), "utf8");

  assert.match(redirects, /^\/netlify\/\* \/ 404!$/m);
  assert.match(redirects, /^\/test\/\* \/ 404!$/m);
  assert.match(redirects, /^\/\.env\* \/ 404!$/m);
  assert.match(redirects, /^\/docker-compose\.local\.ya?ml \/ 404!$/m);
  assert.match(redirects, /^\/compose\.local\.ya?ml \/ 404!$/m);
});

test("all seven connection paths reject remote URIs before MongoClient construction", async () => {
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
    constructor() {
      constructorCalls += 1;
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
    process.env.LOCAL_DEVELOPMENT = "true";
    process.env.CONTEXT = "dev";
    process.env.MONGODB_URI = "mongodb+srv://cluster.example.invalid/round_room";
    process.env.ADMIN_TOKEN = "test-admin-token";
    process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.RAZORPAY_KEY_SECRET = "test-razorpay-key-secret";
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
    await assert.rejects(getDB(), /Local development requires mongodb:\/\/127\.0\.0\.1:27018\/round_room_local/);

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
      assert.equal(response.statusCode, 500, `${file} must reject the unsafe configuration`);
    }

    const roomDb = require("../netlify/functions/room-db");
    const roomDbResponse = await roomDb.handler({});
    assert.equal(roomDbResponse.statusCode, 500);
    assert.equal(constructorCalls, 0);
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