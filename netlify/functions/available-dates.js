/**
 * FILE: available-dates.js
 * PURPOSE: Netlify function to return available dates for order placement.
 *
 * NOTES:
 * - GET: Public endpoint returns dates within booking window with availability status
 * - Checks daily cap for each date and marks dates as available/unavailable
 * - Returns array of dates with capacity information
 * - Used by checkout page to enable/disable date picker options
 */

const { getDB } = require("./db");

const dbName = "round_room";

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function getAvailableDates() {
  try {
    const db = await getDB();
    const settingsCollection = db.collection("settings");
    const ordersCollection = db.collection("orders");

    // Get settings
    const settings = await settingsCollection.findOne({ key: "store" });
    
    const leadTimeDays = Number(settings?.leadTimeDays ?? 1);
    const maxAdvanceDays = Number(settings?.maxAdvanceDays ?? 14);
    const nextAvailableDate = settings?.nextAvailableDate;
    const dailyCapEnabled = typeof settings?.dailyCapEnabled === "boolean" ? settings.dailyCapEnabled : false;
    const dailyCapLimit = Number(settings?.dailyCapLimit ?? 50);
    const storeOpen = typeof settings?.storeOpen === "boolean" ? settings.storeOpen : true;

    // Calculate min date (today + lead time or admin-set next available date)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + leadTimeDays);

    let actualMinDate = minDate;
    if (nextAvailableDate) {
      const adminDate = new Date(nextAvailableDate);
      adminDate.setHours(0, 0, 0, 0);
      if (adminDate > minDate) {
        actualMinDate = adminDate;
      }
    }

    // Calculate max date
    const maxDate = new Date(actualMinDate);
    maxDate.setDate(actualMinDate.getDate() + maxAdvanceDays);

    // Build array of dates with availability
    const availableDates = [];
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i <= maxAdvanceDays; i++) {
      const date = new Date(actualMinDate);
      date.setDate(actualMinDate.getDate() + i);
      
      const dateString = date.toISOString().split('T')[0];
      
      // Count orders for this date (excluding cancelled)
      let orderCount = 0;
      if (dailyCapEnabled) {
        orderCount = await ordersCollection.countDocuments({
          orderDate: dateString,
          status: { $ne: "CANCELLED" }
        });
      }

      const isAvailable = storeOpen && (!dailyCapEnabled || orderCount < dailyCapLimit);
      const dayName = daysOfWeek[date.getDay()];
      const dateFormatted = `${dayName}, ${monthNames[date.getMonth()]} ${date.getDate()}`;
      
      availableDates.push({
        date: dateString,
        dateFormatted,
        dayName,
        available: isAvailable,
        orderCount,
        limit: dailyCapLimit,
        spotsRemaining: dailyCapEnabled ? Math.max(0, dailyCapLimit - orderCount) : null
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        dates: availableDates,
        minDate: actualMinDate.toISOString().split('T')[0],
        maxDate: maxDate.toISOString().split('T')[0],
        dailyCapEnabled,
        storeOpen
      }),
    };
  } catch (err) {
    console.error("GET available-dates error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Could not fetch available dates",
        details: err.message 
      }),
    };
  }
}

exports.handler = async (event) => {
  const headers = buildHeaders();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    const result = await getAvailableDates();
    return { ...result, headers };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
