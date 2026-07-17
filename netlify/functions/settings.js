/**
 * FILE: settings.js
 * PURPOSE: Netlify function to manage store settings (tax rate, currency, open/closed status).
 *
 * NOTES:
 * - GET: Public endpoint returns storeOpen, minOrder, collectionEnabled
 * - GET with admin=1: Returns full settings (requires admin token)
 * - PUT: Updates settings (admin only, requires x-admin-token header)
 * - Settings stored in MongoDB round_room.settings collection
 * - Uses cached MongoDB client for connection reuse
 * - CORS headers allow cross-origin requests
 */

const { getDB } = require("./db");
const { isAdminAuthorized } = require("./utils");

const dbName = "round_room";
const collectionName = "settings";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN;

function buildHeaders(isPublic = false) {
  const origin = isPublic ? "*" : (ADMIN_ORIGIN || "*");
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

async function getWeeklyCapacity(db, dailyLimit) {
  const ordersCollection = db.collection("orders");
  const weeklyData = [];
  
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    
    const dateString = date.toISOString().split('T')[0];
    
    // Count orders scheduled for this date (by orderDate, excluding cancelled)
    const count = await ordersCollection.countDocuments({
      orderDate: dateString,
      status: { $ne: "CANCELLED" }
    });
    
    const dayName = daysOfWeek[date.getDay()];
    const dateFormatted = `${monthNames[date.getMonth()]} ${date.getDate()}`;
    
    weeklyData.push({
      date: date.toISOString().split('T')[0],
      dateFormatted,
      dayName: i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : dayName),
      count,
      limit: dailyLimit
    });
  }
  
  return weeklyData;
}

async function handleGet(isAdmin = false, includeWeekly = false) {
  try {
    const db = await getDB();
    const collection = db.collection(collectionName);

    const settings = await collection.findOne({ key: "store" });
    
    // Check if daily cap is reached for today
    let dailyCapReached = false;
    if (!isAdmin && settings?.dailyCapEnabled) {
      const ordersCollection = db.collection("orders");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayString = today.toISOString().split('T')[0];

      // Count orders scheduled for today (by orderDate, excluding cancelled)
      const todayOrderCount = await ordersCollection.countDocuments({
        orderDate: todayString,
        status: { $ne: "CANCELLED" }
      });

      dailyCapReached = todayOrderCount >= Number(settings.dailyCapLimit ?? 50);
    }
    
    if (!isAdmin) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          storeOpen: typeof settings?.storeOpen === "boolean" ? settings.storeOpen : true,
          minOrder: Number(settings?.minOrder ?? 0),
          collectionEnabled: typeof settings?.collectionEnabled === "boolean" ? settings.collectionEnabled : true,
          preorderOnlyMode: typeof settings?.preorderOnlyMode === "boolean" ? settings.preorderOnlyMode : false,
          nextAvailableDate: settings?.nextAvailableDate || null,
          leadTimeDays: Number(settings?.leadTimeDays ?? 1),
          maxAdvanceDays: Number(settings?.maxAdvanceDays ?? 14),
          dailyCapEnabled: typeof settings?.dailyCapEnabled === "boolean" ? settings.dailyCapEnabled : false,
          dailyCapLimit: Number(settings?.dailyCapLimit ?? 50),
          dailyCapReached: dailyCapReached,
        }),
      };
    }
    
    const result = settings || { key: "store" };
    
    // Add weekly capacity if requested and daily cap is enabled
    if (isAdmin && includeWeekly && settings?.dailyCapEnabled && settings?.dailyCapLimit) {
      result.weeklyCapacity = await getWeeklyCapacity(db, settings.dailyCapLimit);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("GET settings error:", err.message);
    console.error("Full error:", err);
    // Return default settings as fallback when DB is unavailable
    if (!isAdmin) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          storeOpen: false,
          minOrder: 0,
          collectionEnabled: true,
          preorderOnlyMode: false,
          nextAvailableDate: null,
          leadTimeDays: 1,
          maxAdvanceDays: 14,
          dailyCapEnabled: false,
          dailyCapLimit: 50,
          dailyCapReached: false,
        }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: err.message,
        hint: "Check MONGODB_URI in Netlify environment variables and MongoDB Atlas network access" 
      }),
    };
  }
}

async function handlePut(body) {
  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let updates;
  try {
    updates = typeof body === "string" ? JSON.parse(body) : body;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const next = {
    taxRate: Number(updates.taxRate ?? 5),
    currency: updates.currency || "INR",
    invoicePrefix: updates.invoicePrefix || "ORD",
    storeOpen: typeof updates.storeOpen === "boolean" ? updates.storeOpen : true,
    minOrder: Number(updates.minOrder ?? 0),
    collectionEnabled: typeof updates.collectionEnabled === "boolean" ? updates.collectionEnabled : true,
    preorderOnlyMode: typeof updates.preorderOnlyMode === "boolean" ? updates.preorderOnlyMode : false,
    nextAvailableDate: updates.nextAvailableDate || null,
    dailyCapEnabled: typeof updates.dailyCapEnabled === "boolean" ? updates.dailyCapEnabled : false,
    dailyCapLimit: Number(updates.dailyCapLimit ?? 50),
    leadTimeDays: Number(updates.leadTimeDays ?? 1),
    maxAdvanceDays: Number(updates.maxAdvanceDays ?? 14),
    updatedAt: new Date(),
  };

  try {
    const db = await getDB();
    const collection = db.collection(collectionName);

    await collection.updateOne(
      { key: "store" },
      { $set: { key: "store", ...next } },
      { upsert: true }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("PUT settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const isAdmin = isAdminAuthorized(event.headers, ADMIN_TOKEN);
  const isAdminRequest = event.queryStringParameters?.admin === "1";
  const headers = buildHeaders(!(isAdmin && isAdminRequest));

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (method === "GET") {
    if (isAdminRequest && !isAdmin) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
    
    const includeWeekly = event.queryStringParameters?.weekly === "1";
    return { ...(await handleGet(isAdmin && isAdminRequest, includeWeekly)), headers };
  }

  if (!isAdmin) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  if (method === "PUT") {
    return { ...(await handlePut(event.body)), headers };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
