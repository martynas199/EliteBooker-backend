// Load environment variables first (must be before all other imports)
import "./config/env.js";
import "./instrument.js";

import { createApp } from "./app.js";
import { connectToDatabase } from "./config/database.js";
import { rootLogger } from "./utils/logger.js";

const PORT = process.env.PORT || 4000;
const startupLogger = rootLogger.child({ scope: "startup" });
const nodeLogger = startupLogger.toNodeLogger();
const { app, allowedOrigins } = createApp({ logger: nodeLogger });

export async function startServer() {
  await connectToDatabase({ logger: nodeLogger });

  app.listen(PORT, () => {
    startupLogger.info("API listening", { port: Number(PORT) });
    startupLogger.info("Security features enabled", {
      helmet: true,
      corsOrigins: allowedOrigins,
      rateLimiting: true,
      jwtAdminRoutes: true,
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((error) => {
    startupLogger.error("Failed to start server", error);
    process.exit(1);
  });
}

export default app;

