/**
 * Referral Code Generator Utility
 * Generates unique 6-character alphanumeric referral codes
 * Format: 3 uppercase letters + 3 digits (e.g., ABC234)
 * Excludes confusing characters (I, O in letters; 0, 1 in digits)
 */

import ReferralCode from "../models/ReferralCode.js";

// Character sets for code generation
const ALLOWED_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Excludes I, O
const ALLOWED_DIGITS = "23456789"; // Excludes 0, 1

/**
 * Generate a random character from a given character set
 * @param {string} charset - Characters to choose from
 * @returns {string} - Single random character
 */
function getRandomChar(charset) {
  return charset[Math.floor(Math.random() * charset.length)];
}

/**
 * Generate a referral code with format: LLL###
 * @returns {string} - Generated code (e.g., "ABC234")
 */
function generateCode() {
  // Generate 3 letters
  const letters = Array.from({ length: 3 }, () =>
    getRandomChar(ALLOWED_LETTERS),
  ).join("");

  // Generate 3 digits
  const digits = Array.from({ length: 3 }, () =>
    getRandomChar(ALLOWED_DIGITS),
  ).join("");

  return letters + digits;
}

/**
 * Check if a code already exists in the database
 * @param {string} code - Code to check
 * @returns {Promise<boolean>} - True if code exists
 */
async function codeExists(code) {
  const existing = await ReferralCode.findOne({ code });
  return !!existing;
}

/**
 * Generate a unique referral code
 * Attempts multiple times if collision occurs
 * @param {number} maxAttempts - Maximum generation attempts (default: 10)
 * @returns {Promise<string>} - Unique referral code
 * @throws {Error} - If unable to generate unique code after max attempts
 */
async function generateUniqueCode(maxAttempts = 10) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const code = generateCode();

    // Check if code already exists
    const exists = await codeExists(code);

    if (!exists) {
      return code;
    }

    attempts++;
  }

  throw new Error(
    `Failed to generate unique referral code after ${maxAttempts} attempts`,
  );
}

/**
 * Validate referral code format
 * @param {string} code - Code to validate
 * @returns {boolean} - True if format is valid
 */
function isValidFormat(code) {
  if (!code || typeof code !== "string") {
    return false;
  }

  // Must be exactly 6 characters
  if (code.length !== 6) {
    return false;
  }

  // Must match format: 3 uppercase letters + 3 digits
  const pattern = /^[A-Z]{3}[2-9]{3}$/;
  return pattern.test(code);
}

/**
 * Normalize a code (uppercase, trim whitespace)
 * @param {string} code - Code to normalize
 * @returns {string} - Normalized code
 */
function normalizeCode(code) {
  if (!code || typeof code !== "string") {
    return "";
  }
  return code.trim().toUpperCase();
}

export {
  generateUniqueCode,
  isValidFormat,
  normalizeCode,
  generateCode, // Exported for testing
  codeExists, // Exported for testing
};
