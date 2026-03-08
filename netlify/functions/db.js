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
