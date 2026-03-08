const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getDB } = require("./db");

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

    // Check if email already exists
    const existingUser = await users.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return buildResponse(409, { error: "Email already exists" });
    }

    // Check if phone already exists
    const existingPhone = await users.findOne({ phone: phone.trim() });
    if (existingPhone) {
      return buildResponse(409, { error: "Phone number already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user document
    const now = new Date();
    const userDoc = {
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
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

    // Generate JWT token
    const token = jwt.sign(
      { userId: userId.toString(), role: "customer" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

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
