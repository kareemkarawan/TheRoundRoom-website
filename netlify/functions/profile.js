const { ObjectId } = require("mongodb");
const { getDB } = require("./db");
const { verifyAuth } = require("./auth");

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return buildResponse(200, {});
  }

  if (event.httpMethod !== "GET") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  try {
    // Verify authentication
    const { userId } = await verifyAuth(event);

    const db = await getDB();
    const users = db.collection("users");

    // Convert userId string to ObjectId
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (e) {
      return buildResponse(400, { error: "Invalid user ID" });
    }

    // Query user with projection to exclude sensitive fields
    const user = await users.findOne(
      { _id: userObjectId },
      {
        projection: {
          email: 1,
          phone: 1,
          addresses: 1,
          createdAt: 1,
        },
      }
    );

    if (!user) {
      return buildResponse(404, { error: "User not found" });
    }

    return buildResponse(200, {
      profile: {
        email: user.email,
        phone: user.phone,
        addresses: user.addresses || [],
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    if (err.message.includes("authorization") || err.message.includes("token")) {
      return buildResponse(401, { error: err.message });
    }
    console.error("Profile error:", err);
    return buildResponse(500, { error: "Internal server error" });
  }
};
