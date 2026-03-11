/**
 * FILE: db.js
 * PURPOSE: Shared MongoDB connection module with connection caching.
 *
 * NOTES:
 * - getDB() returns database instance, reusing cached client
 * - Uses MONGODB_URI env var for connection string
 * - Database name is "round_room"
 * - 5 second server selection timeout
 * - Single cached client shared across function invocations
 */

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = "round_room";

let cachedClient = null;

async function getDB() {
  if (cachedClient) {
    return cachedClient.db(dbName);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  cachedClient = client;

  return client.db(dbName);
}

module.exports = { getDB };
