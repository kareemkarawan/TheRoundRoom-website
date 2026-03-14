/**
 * FILE: visitor-counter.js
 * PURPOSE: Track and return website visitor statistics.
 *
 * NOTES:
 * - GET: Returns current visitor count
 * - POST: Increments visit count and tracks unique visitors by IP
 * - Stores data in MongoDB round_room.visitor_stats collection
 * - Uses hashed IP for privacy (doesn't store raw IPs)
 */

const { getDB } = require("./db");
const crypto = require("crypto");

const collectionName = "visitor_stats";

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function hashIP(ip) {
  return crypto.createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 16);
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: buildHeaders(), body: "" };
  }

  try {
    const db = await getDB();
    const collection = db.collection(collectionName);

    if (event.httpMethod === "GET") {
      // Return current stats
      const stats = await collection.findOne({ key: "stats" });
      return {
        statusCode: 200,
        headers: buildHeaders(),
        body: JSON.stringify({
          totalVisits: stats?.totalVisits || 0,
          uniqueVisitors: stats?.uniqueVisitors || 0,
        }),
      };
    }

    if (event.httpMethod === "POST") {
      // Get visitor IP and hash it for privacy
      const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() 
                 || event.headers["client-ip"] 
                 || "unknown";
      const hashedIP = hashIP(ip);

      // Check if this is a unique visitor
      const existingVisitor = await collection.findOne({ 
        key: "visitor", 
        hashedIP: hashedIP 
      });

      const isNewVisitor = !existingVisitor;

      // Update total visits and unique count
      const updateResult = await collection.findOneAndUpdate(
        { key: "stats" },
        { 
          $inc: { 
            totalVisits: 1,
            uniqueVisitors: isNewVisitor ? 1 : 0
          },
          $setOnInsert: { key: "stats" }
        },
        { upsert: true, returnDocument: "after" }
      );

      // Record unique visitor if new
      if (isNewVisitor) {
        await collection.insertOne({
          key: "visitor",
          hashedIP: hashedIP,
          firstVisit: new Date(),
        });
      }

      return {
        statusCode: 200,
        headers: buildHeaders(),
        body: JSON.stringify({
          totalVisits: updateResult.totalVisits || 1,
          uniqueVisitors: updateResult.uniqueVisitors || 1,
          isNewVisitor: isNewVisitor,
        }),
      };
    }

    return {
      statusCode: 405,
      headers: buildHeaders(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };

  } catch (err) {
    console.error("Visitor counter error:", err);
    return {
      statusCode: 500,
      headers: buildHeaders(),
      body: JSON.stringify({ error: "Failed to track visit" }),
    };
  }
};
