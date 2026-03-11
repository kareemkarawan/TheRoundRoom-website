/**
 * FILE: utils.js
 * PURPOSE: Shared utility functions for Netlify functions including admin auth.
 *
 * NOTES:
 * - safeCompare() uses crypto.timingSafeEqual to prevent timing attacks
 * - isAdminAuthorized() validates x-admin-token header against env var
 * - Both functions return false for missing/invalid inputs
 */

const crypto = require("crypto");

function safeCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isAdminAuthorized(headers = {}, adminToken) {
  if (!adminToken) return false;
  const token = headers["x-admin-token"] || headers["X-Admin-Token"];
  if (!token) return false;
  return safeCompare(token, adminToken);
}

module.exports = { safeCompare, isAdminAuthorized };
