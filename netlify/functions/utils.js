const crypto = require("crypto");

/**
 * Timing-safe string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings match
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Check if admin token is valid
 * @param {object} headers - Request headers
 * @param {string} adminToken - The expected admin token from env
 * @returns {boolean} - True if authorized
 */
function isAdminAuthorized(headers = {}, adminToken) {
  if (!adminToken) return false;
  const token = headers["x-admin-token"] || headers["X-Admin-Token"];
  if (!token) return false;
  return safeCompare(token, adminToken);
}

module.exports = { safeCompare, isAdminAuthorized };
