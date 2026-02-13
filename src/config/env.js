import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "../../");
const nodeEnv = process.env.NODE_ENV || "development";

// Load base environment variables from .env
dotenv.config({ path: path.join(projectRoot, ".env") });

// Load environment-specific variables (e.g. .env.test, .env.production)
const envSpecificPath = path.join(projectRoot, `.env.${nodeEnv}`);
if (fs.existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath, override: true });
}

export default process.env;
