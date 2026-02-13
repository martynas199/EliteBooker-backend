// Load environment variables first (must be before all other imports)
import "./config/env.js";
import "./instrument.js";

import { createApp } from "./app.js";
import { connectToDatabase } from "./config/database.js";

const PORT = process.env.PORT || 4000;
const { app, allowedOrigins } = createApp();

export async function startServer() {
  await connectToDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 API listening on :${PORT}`);
    console.log(`🔒 Security features enabled:`);
    console.log(`   - Helmet security headers`);
    console.log(`   - CORS restricted to: ${allowedOrigins.join(", ")}`);
    console.log(`   - Rate limiting active`);
    console.log(`   - JWT authentication required for admin routes`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

export default app;
