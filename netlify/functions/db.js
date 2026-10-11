/**
 * FILE: db.js
 * PURPOSE: Shared MongoDB connection module with connection caching.
 *
 * NOTES:
 * - getDB() returns database instance, reusing cached client
 * - Uses MONGODB_URI env var for connection string
 * - Database name is "round_room"
 * - Single cached client shared across function invocations
 */

const { createMongoClient } = require("../mongo-uri");
const dbName = "round_room";

let cachedClient = null;

async function getDB() {
  if (cachedClient) {
    try {
      // Verify cached connection is still alive
      await cachedClient.db(dbName).admin().ping();
      return cachedClient.db(dbName);
    } catch (err) {
      console.warn("Cached MongoDB connection failed, reconnecting...", err.message);
      cachedClient = null;
    }
  }

  const client = createMongoClient({
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  try {
    await client.connect();
    cachedClient = client;
    console.log("MongoDB connected successfully");
    return client.db(dbName);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    throw new Error(`Database connection failed: ${err.message}`);
  }
}

module.exports = { getDB };
