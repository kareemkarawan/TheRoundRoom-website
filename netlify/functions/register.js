const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getDB } = require("./db");
const { getClientIp, recordAuthEvent } = require("./auth-activity");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = "7d";

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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

  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch (e) {
    return buildResponse(400, { error: "Invalid JSON" });
  }

  const { email, phone, password } = payload || {};

  // Validate required fields
  if (!email || !phone || !password) {
    return buildResponse(400, { error: "Email, phone, and password are required" });
  }

  // Validate password length
  if (password.length < 8) {
    return buildResponse(400, { error: "Password must be at least 8 characters long" });
  }

  try {
    const db = await getDB();
    const users = db.collection("users");
    const sessions = db.collection("sessions");
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.trim();

    // Check if email already exists
    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
      await recordAuthEvent(db, "register", {
        level: "warn",
        source: "register",
        message: "Registration blocked: email already exists",
        details: { email: normalizedEmail },
        meta: { ip: getClientIp(event.headers || {}) },
        userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      });
      return buildResponse(409, { error: "Email already exists" });
    }

    // Check if phone already exists
    const existingPhone = await users.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      await recordAuthEvent(db, "register", {
        level: "warn",
        source: "register",
        message: "Registration blocked: phone already exists",
        details: { phone: normalizedPhone },
        meta: { ip: getClientIp(event.headers || {}) },
        userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      });
      return buildResponse(409, { error: "Phone number already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user document
    const now = new Date();
    const userDoc = {
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      addresses: [],
      role: "customer",
      loginAttempts: 0,
      lockUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    // Insert user
    const result = await users.insertOne(userDoc);
    const userId = result.insertedId;
    const tokenId = crypto.randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Generate JWT token
    const token = jwt.sign(
      { userId: userId.toString(), role: "customer" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION, jwtid: tokenId }
    );

    await sessions.insertOne({
      userId: userId.toString(),
      jti: tokenId,
      createdAt: issuedAt,
      lastSeenAt: issuedAt,
      expiresAt,
      revokedAt: null,
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      ip: getClientIp(event.headers || {}),
    });

    await recordAuthEvent(db, "register", {
      source: "register",
      message: "User registered",
      details: { userId: userId.toString(), email: normalizedEmail },
      meta: { ip: getClientIp(event.headers || {}) },
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
    });

    await recordAuthEvent(db, "login", {
      source: "login",
      message: "User logged in after registration",
      details: { userId: userId.toString(), email: normalizedEmail },
      meta: { ip: getClientIp(event.headers || {}) },
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
    });

    return buildResponse(201, {
      success: true,
      userId: userId.toString(),
      token,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return buildResponse(500, { error: "Internal server error" });
  }
};
