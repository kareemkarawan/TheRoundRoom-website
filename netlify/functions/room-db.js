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
      serverSelectionTimeoutMS: 5000, // fail fast instead of hanging
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
