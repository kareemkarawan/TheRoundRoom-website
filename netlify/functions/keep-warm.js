/**
 * FILE: keep-warm.js
 * PURPOSE: Scheduled function that runs every 5 minutes to prevent cold starts.
 *
 * NOTES:
 * - Pings menu, combo-settings, and bagel-boxes functions to keep them warm
 * - Runs on Netlify's scheduled functions (cron: */5 * * * *)
 * - Reduces cold start latency for customers visiting the menu page
 */

const { getDB } = require("./db");

exports.handler = async (event) => {
  // Only run on scheduled events
  if (event.httpMethod && event.httpMethod !== "GET") {
    return { statusCode: 200, body: "OK" };
  }

  const startTime = Date.now();

  try {
    // Warm up the database connection
    const db = await getDB();
    
    // Quick query to keep MongoDB connection alive
    await db.collection("menu").findOne({});
    
    const elapsed = Date.now() - startTime;
    console.log(`Keep-warm completed in ${elapsed}ms`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        status: "warm",
        elapsed: elapsed,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (err) {
    console.error("Keep-warm error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
