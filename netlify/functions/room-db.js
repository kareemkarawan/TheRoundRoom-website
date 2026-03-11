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

const { MongoClient } = require("mongodb");

exports.handler = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return {
      statusCode: 500,
      body: "MONGODB_URI not set",
    };
  }

  let client;

  try {
    client = new MongoClient(uri, {
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
