import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";

await mongoose.connect(process.env.MONGO_URI);
const admin = await Admin.collection.findOne({ email: "eliza.20@hotmail.com" });
console.log("TenantId:", admin?.tenantId?.toString());
await mongoose.disconnect();
