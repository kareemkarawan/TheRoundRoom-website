/**
 * FILE: menu-data.js
 * PURPOSE: Combined endpoint that returns menu, combo settings, and boxes in ONE call.
 *
 * NOTES:
 * - Reduces 3 API calls to 1 for faster initial page load
 * - Returns: { menu: [...], combo: {...}, boxes: [...] }
 * - Aggressive caching for CDN edge delivery
 */

const { getDB } = require("./db");

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Cache at CDN edge for 30s, serve stale for 60s while revalidating
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    // Netlify-specific: cache at edge
    "Netlify-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: buildHeaders(), body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: buildHeaders(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const db = await getDB();
    
    // Fetch all data in parallel
    const [menuItems, comboSettings, boxes] = await Promise.all([
      db.collection("menu").find({}).toArray(),
      db.collection("combo_settings").findOne({ id: "combo" }),
      db.collection("bagel_boxes").find({ isAvailable: true }).sort({ sortOrder: 1, createdAt: 1 }).toArray(),
    ]);

    // Default combo settings if none exist
    const combo = comboSettings || {
      id: "combo",
      price: 0,
      isAvailable: false,
      availableBagels: [],
      availableSchmears: [],
    };

    return {
      statusCode: 200,
      headers: buildHeaders(),
      body: JSON.stringify({
        menu: menuItems,
        combo: combo,
        boxes: boxes || [],
      }),
    };
  } catch (err) {
    console.error("menu-data error:", err);
    return {
      statusCode: 500,
      headers: buildHeaders(),
      body: JSON.stringify({ error: err.message }),
    };
  }
};
