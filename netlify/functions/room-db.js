const { MongoClient } = require("mongodb");

let cachedClient = null;

exports.handler = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "MONGODB_URI not set" }),
    };
  }

  try {
    if (!cachedClient) {
      const client = new MongoClient(uri);
      await client.connect();
      cachedClient = client;
    }

    // Simple ping to confirm connection
    await cachedClient.db().command({ ping: 1 });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Connected to MongoDB successfully 🎉",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message,
      }),
    };
  }
};
