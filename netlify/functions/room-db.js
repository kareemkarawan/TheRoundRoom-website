/**
 * FILE: room-db.js
 * PURPOSE: Simple health check function to test MongoDB connectivity.
 *
 * NOTES:
 * - Returns 200 with success message if MongoDB connection works
 * - Returns 500 with error message if connection fails
 * - Uses ping command to verify database is responsive
 * - Closes connection after test (not cached)
 */

const { createMongoClient } = require("../mongo-uri");
const { withNoStore } = require("./utils");

exports.handler = async () => {
  let client;

  try {
    client = createMongoClient({
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    await client.db().command({ ping: 1 });

    return {
      statusCode: 200,
      body: "Connected to MongoDB successfully 🎉",
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: `MongoDB error: ${err.message}`,
    };
  } finally {
    if (client) await client.close();
  }
};

exports.handler = withNoStore(exports.handler);
