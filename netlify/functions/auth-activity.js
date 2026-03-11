/**
 * FILE: auth-activity.js
 * PURPOSE: Utility functions for recording authentication events and extracting client IP.
 *
 * NOTES:
 * - getClientIp() extracts IP from x-forwarded-for or client-ip headers
 * - recordAuthEvent() logs auth events to audit_logs collection
 * - Events include login, logout, registration attempts
 * - Each event has type, level, message, details, source, userAgent, meta
 * - Silently fails if audit log write fails (non-blocking)
 */

function getClientIp(headers = {}) {
  return (
    headers["x-forwarded-for"] ||
    headers["X-Forwarded-For"] ||
    headers["client-ip"] ||
    headers["Client-Ip"] ||
    null
  );
}

async function recordAuthEvent(db, event, payload = {}) {
  try {
    const collection = db.collection("audit_logs");
    await collection.insertOne({
      type: "action",
      level: payload.level || "info",
      message: payload.message || event,
      details: payload.details || null,
      source: payload.source || event,
      url: payload.url || null,
      userAgent: payload.userAgent || null,
      meta: payload.meta || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn("Auth audit log write failed:", err.message);
  }
}

module.exports = {
  getClientIp,
  recordAuthEvent,
};
