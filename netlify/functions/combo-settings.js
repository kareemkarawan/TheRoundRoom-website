/**
 * FILE: combo-settings.js
 * PURPOSE: Netlify function to manage bagel+schmear and Carbies combo settings.
 *
 * NOTES:
 * - GET: Returns combo price, availability, allowed item IDs, and Carbies order days
 * - PUT: Updates combo settings (admin only, requires x-admin-token)
 * - Settings stored in MongoDB round_room.combo_settings collection
 * - Single document with id="combo" holds all combo configuration
 * - Dynamic settings are never cached
 * - Default returns unavailable combo if no settings exist
 */

const { getDB } = require("./db");
const { isAdminAuthorized, withNoStore } = require("./utils");

const dbName = "round_room";
const collectionName = "combo_settings";
const DEFAULT_CARBIES_ORDER_DAYS = [0, 3, 6];
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN;

function normalizeAllowedPincodes(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .flatMap(v => String(v).split(',') || [])
    .map(v => String(v).trim())
    .filter(Boolean))];
}

function defaultCarbiesSandwichSettings() {
  return {
    sectionTitle: "The Round Room x Carbies",
    title: "The Carbies Combo",
    description: "",
    price: 0,
    isAvailable: false,
    availableBagels: [],
    availableSchmears: [],
    bagelLabel: "Choose your bagel:",
    bagelPlaceholder: "Select a bagel",
    schmearLabel: "Choose your schmear:",
    schmearPlaceholder: "Select a schmear",
    buttonLabel: "Add to Cart",
    imageUrl: "",
    allowedPincodes: [],
  };
}

function buildHeaders(isAdminRoute = false) {
  const origin = isAdminRoute && ADMIN_ORIGIN ? ADMIN_ORIGIN : "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  };
}

// GET: fetch combo settings
async function handleGet() {
  try {
    const db = await getDB();
    const collection = db.collection(collectionName);

    // There's only one combo settings document with id "combo"
    let settings = await collection.findOne({ id: "combo" });

    if (!settings) {
      // Return default settings if none exist
      settings = {
        id: "combo",
        price: 0,
        isAvailable: false,
        availableBagels: [],
        availableSchmears: [],
        description: "",
        imageUrl: "",
        allowedPincodes: [],
        carbiesOrderDays: DEFAULT_CARBIES_ORDER_DAYS,
      };
    }
    settings = {
      id: "combo",
      price: 0,
      isAvailable: false,
      availableBagels: [],
      availableSchmears: [],
      description: "",
      imageUrl: "",
      allowedPincodes: [],
      ...settings,
      carbiesOrderDays: Array.isArray(settings.carbiesOrderDays)
        ? settings.carbiesOrderDays
        : DEFAULT_CARBIES_ORDER_DAYS,
      carbiesSandwich: {
        ...defaultCarbiesSandwichSettings(),
        ...(settings.carbiesSandwich || {}),
      },
    };

    return {
      statusCode: 200,
      body: JSON.stringify(settings),
    };
  } catch (err) {
    console.error("GET combo settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

// PUT: update combo settings (admin only)
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

  const hasComboUpdates = updates.price !== undefined ||
    updates.isAvailable !== undefined ||
    updates.availableBagels !== undefined ||
    updates.availableSchmears !== undefined ||
    updates.description !== undefined ||
    updates.imageUrl !== undefined ||
    updates.allowedPincodes !== undefined ||
    updates.availablePincodes !== undefined;
  const priceValue = Number(updates.price);
  if (hasComboUpdates && (Number.isNaN(priceValue) || priceValue < 0)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid price value" }),
    };
  }

  try {
    const db = await getDB();
    const collection = db.collection(collectionName);

    const now = new Date();
    const settingsData = { id: "combo", updatedAt: now };
    if (updates.carbiesOrderDays !== undefined) {
      if (
        !Array.isArray(updates.carbiesOrderDays) ||
        updates.carbiesOrderDays.length === 0 ||
        updates.carbiesOrderDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Carbies order days must include at least one valid weekday (0-6)" }),
        };
      }
      settingsData.carbiesOrderDays = [...new Set(updates.carbiesOrderDays)];
    }

    if (hasComboUpdates) {
      Object.assign(settingsData, {
        price: priceValue,
        isAvailable: updates.isAvailable === true,
        availableBagels: Array.isArray(updates.availableBagels) ? updates.availableBagels : [],
        availableSchmears: Array.isArray(updates.availableSchmears) ? updates.availableSchmears : [],
        description: typeof updates.description === "string" ? updates.description.trim() : "",
        allowedPincodes: normalizeAllowedPincodes(updates.allowedPincodes || updates.availablePincodes || []),
      });
    }

    if (hasComboUpdates && typeof updates.imageUrl === "string") {
      settingsData.imageUrl = updates.imageUrl.trim();
    }

    if (updates.carbiesSandwich !== undefined) {
      if (!updates.carbiesSandwich || typeof updates.carbiesSandwich !== "object" || Array.isArray(updates.carbiesSandwich)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid Carbies combo settings" }),
        };
      }
      const collab = updates.carbiesSandwich;
      const collabPrice = Number(collab.price);
      if (Number.isNaN(collabPrice) || collabPrice < 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid Carbies combo price" }),
        };
      }
      const defaults = defaultCarbiesSandwichSettings();
      const textFields = [
        "sectionTitle",
        "title",
        "description",
        "bagelLabel",
        "bagelPlaceholder",
        "schmearLabel",
        "schmearPlaceholder",
        "buttonLabel",
        "imageUrl",
      ];
      const collabSettings = {
        ...defaults,
        price: collabPrice,
        isAvailable: collab.isAvailable === true,
        availableBagels: Array.isArray(collab.availableBagels) ? collab.availableBagels : [],
        availableSchmears: Array.isArray(collab.availableSchmears) ? collab.availableSchmears.slice(0, 1) : [],
        allowedPincodes: normalizeAllowedPincodes(collab.allowedPincodes || []),
      };
      for (const field of textFields) {
        if (typeof collab[field] === "string") collabSettings[field] = collab[field].trim();
      }
      settingsData.carbiesSandwich = collabSettings;
    }

    await collection.updateOne(
      { id: "combo" },
      { $set: settingsData },
      { upsert: true }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Combo settings updated successfully",
      }),
    };
  } catch (err) {
    console.error("PUT combo settings error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}

exports.handler = withNoStore(async (event) => {
  const method = event.httpMethod;
  const body = event.body;
  const isAdminRoute = method !== "GET" && method !== "OPTIONS";

  // CORS headers
  const headers = buildHeaders(isAdminRoute);
  // Handle preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (isAdminRoute && !isAdminAuthorized(event.headers, ADMIN_TOKEN)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized: invalid or missing admin token" }),
    };
  }

  let response;

  if (method === "GET") {
    response = await handleGet();
  } else if (method === "PUT") {
    response = await handlePut(body);
  } else {
    response = {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  return {
    ...response,
    headers,
  };
});
