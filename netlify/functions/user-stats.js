const { getDB } = require("./db");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    },
    body: JSON.stringify(body),
  };
}

function getAdminToken(headers = {}) {
  return headers["x-admin-token"] || headers["X-Admin-Token"] || "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return buildResponse(200, {});
  }

  if (event.httpMethod !== "GET") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  if (!ADMIN_TOKEN || getAdminToken(event.headers || {}) !== ADMIN_TOKEN) {
    return buildResponse(401, { error: "Unauthorized" });
  }

  try {
    const db = await getDB();
    const users = db.collection("users");
    const sessions = db.collection("sessions");
    const now = new Date();

    const [registeredUsers, currentlyLoggedInUsers] = await Promise.all([
      users.countDocuments({}),
      sessions.countDocuments({ revokedAt: null, expiresAt: { $gt: now } }),
    ]);

    return buildResponse(200, {
      registeredUsers,
      currentlyLoggedInUsers,
      asOf: now.toISOString(),
    });
  } catch (err) {
    console.error("User stats error:", err);
    return buildResponse(500, { error: "Internal server error" });
  }
};
