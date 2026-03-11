const jwt = require("jsonwebtoken");
const { getDB } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET is missing or too short. It must be at least 32 characters long.");
}

async function verifyAuth(event) {
  if (!JWT_SECRET) {
    throw new Error("Server configuration error: JWT_SECRET is not set");
  }
  
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.slice(7).trim(); // Remove "Bearer " prefix

  if (!token) {
    throw new Error("Missing token");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.jti) {
      return decoded;
    }

    const db = await getDB();
    const sessions = db.collection("sessions");
    const activeSession = await sessions.findOne({
      jti: decoded.jti,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!activeSession) {
      throw new Error("Invalid or expired session");
    }

    return decoded; // Contains userId, role, etc.
  } catch (err) {
    throw new Error("Invalid or expired token");
  }
}

module.exports = { verifyAuth };
