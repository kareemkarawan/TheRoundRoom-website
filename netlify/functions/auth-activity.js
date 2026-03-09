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
