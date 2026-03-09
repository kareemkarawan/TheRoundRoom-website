const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { getDB } = require("./db");
const { getClientIp, recordAuthEvent } = require("./auth-activity");

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
    const sessions = db.collection("sessions");
    const normalizedEmail = email.toLowerCase().trim();

    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
      await recordAuthEvent(db, "login", {
        level: "warn",
        source: "login",
        message: "Login failed: user not found",
        details: { email: normalizedEmail },
        meta: { ip: getClientIp(event.headers || {}) },
        userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      });
      return buildResponse(401, { error: "Invalid email or password" });
    }

    // Check if account is locked
    if (user.lockUntil && new Date() < new Date(user.lockUntil)) {
      await recordAuthEvent(db, "login", {
        level: "warn",
        source: "login",
        message: "Login blocked: account locked",
        details: { userId: user._id.toString(), email: user.email, lockUntil: user.lockUntil },
        meta: { ip: getClientIp(event.headers || {}) },
        userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      });
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
      await recordAuthEvent(db, "login", {
        level: "warn",
        source: "login",
        message: "Login failed: invalid password",
        details: {
          userId: user._id.toString(),
          email: user.email,
          attempts: newAttempts,
          locked: newAttempts >= MAX_LOGIN_ATTEMPTS,
        },
        meta: { ip: getClientIp(event.headers || {}) },
        userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      });
      return buildResponse(401, { error: "Invalid email or password" });
    }

    // Successful login - reset attempts and lock
    await users.updateOne(
      { _id: user._id },
      { $set: { loginAttempts: 0, lockUntil: null, updatedAt: new Date() } }
    );
    await sessions.updateMany(
      { userId: user._id.toString(), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    const tokenId = crypto.randomUUID();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION, jwtid: tokenId }
    );

    await sessions.insertOne({
      userId: user._id.toString(),
      jti: tokenId,
      createdAt: issuedAt,
      lastSeenAt: issuedAt,
      expiresAt,
      revokedAt: null,
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      ip: getClientIp(event.headers || {}),
    });

    await recordAuthEvent(db, "login", {
      source: "login",
      message: "User logged in",
      details: { userId: user._id.toString(), email: user.email },
      meta: { ip: getClientIp(event.headers || {}) },
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
    });

    return buildResponse(200, {
      token,
      userId: user._id.toString(),
    });
  } catch (err) {
    console.error("Login error:", err);
    return buildResponse(500, { error: "Internal server error" });
  }
};
