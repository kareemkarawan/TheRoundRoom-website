const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getDB } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = "7d";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 30;

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

  const { email, password } = payload || {};

  if (!email || !password) {
    return buildResponse(400, { error: "Email and password are required" });
  }

  try {
    const db = await getDB();
    const users = db.collection("users");

    const user = await users.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return buildResponse(401, { error: "Invalid email or password" });
    }

    // Check if account is locked
    if (user.lockUntil && new Date() < new Date(user.lockUntil)) {
      return buildResponse(423, { error: "Account is temporarily locked due to too many failed login attempts" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Increment attempts
      const newAttempts = (user.loginAttempts || 0) + 1;
      const updateDoc = { loginAttempts: newAttempts };

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updateDoc.lockUntil = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
      }

      await users.updateOne({ _id: user._id }, { $set: updateDoc });
      return buildResponse(401, { error: "Invalid email or password" });
    }

    // Successful login - reset attempts and lock
    await users.updateOne(
      { _id: user._id },
      { $set: { loginAttempts: 0, lockUntil: null, updatedAt: new Date() } }
    );

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    return buildResponse(200, {
      token,
      userId: user._id.toString(),
    });
  } catch (err) {
    console.error("Login error:", err);
    return buildResponse(500, { error: "Internal server error" });
  }
};
