/**
 * FILE: logout.js
 * PURPOSE: Netlify function to log out users by revoking their session.
 *
 * NOTES:
 * - POST only, requires valid JWT in Authorization header
 * - Marks session as revoked with current timestamp
 * - Records logout event to audit log
 * - Returns success even if session already revoked
 * - Returns 401 for invalid/expired tokens
 */

const { getDB } = require("./db");
const { verifyAuth } = require("./auth");
const { getClientIp, recordAuthEvent } = require("./auth-activity");

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return buildResponse(200, {});
  }

  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  try {
    const decoded = await verifyAuth(event);
    const db = await getDB();
    const sessions = db.collection("sessions");

    if (decoded.jti) {
      await sessions.updateOne(
        { jti: decoded.jti, revokedAt: null },
        { $set: { revokedAt: new Date(), lastSeenAt: new Date() } }
      );
    }

    await recordAuthEvent(db, "logout", {
      source: "logout",
      message: "User logged out",
      details: {
        userId: decoded.userId,
        role: decoded.role || "customer",
      },
      meta: {
        ip: getClientIp(event.headers || {}),
      },
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
    });

    return buildResponse(200, { success: true });
  } catch (err) {
    if (err.message.includes("authorization") || err.message.includes("token") || err.message.includes("session")) {
      return buildResponse(401, { error: err.message });
    }
    console.error("Logout error:", err);
    return buildResponse(500, { error: "Internal server error" });
  }
};
