/**
 * FILE: menu-data.js
 * PURPOSE: Combined endpoint that returns menu, combo settings, and boxes in ONE call.
 *
 * NOTES:
 * - Reduces 3 API calls to 1 for faster initial page load
 * - Returns: { menu: [...], combo: {...}, boxes: [...] }
 * - Dynamic menu data is never cached so admin changes are visible immediately
 */

const { getDB } = require("./db");
const { withNoStore } = require("./utils");

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

exports.handler = withNoStore(async (event) => {
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
      description: "",
      allowedPincodes: [],
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
});
