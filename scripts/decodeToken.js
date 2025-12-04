import jwt from "jsonwebtoken";

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.log("Usage: node decodeToken.js <token>");
  process.exit(1);
}

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

try {
  const decoded = jwt.decode(token); // Decode without verification to see content
  console.log("Token payload (decoded):", JSON.stringify(decoded, null, 2));

  // Also verify
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    console.log("\n✓ Token is valid");
  } catch (err) {
    console.log("\n✗ Token verification failed:", err.message);
  }
} catch (error) {
  console.error("Error decoding token:", error.message);
}
