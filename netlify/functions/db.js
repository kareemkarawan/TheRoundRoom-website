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

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";

// Validate MONGODB_URI exists at module load time
if (!uri) {
  console.error("CRITICAL: MONGODB_URI environment variable is not set!");
}

let cachedClient = null;

async function getDB() {
  // Check URI exists before attempting connection
  if (!uri) {
    throw new Error("MONGODB_URI is not configured. Please add it in Netlify environment variables.");
  }

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

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
    socketTimeoutMS: 5000,
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
