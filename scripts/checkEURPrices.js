import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../src/models/Product.js";

dotenv.config();

async function checkEURPrices() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to database");

    const products = await Product.find();
    console.log(`\nFound ${products.length} products:\n`);

    products.forEach((p) => {
      console.log("-----------------------------------");
      console.log("Title:", p.title);
      console.log("Price GBP:", p.price);
      console.log("Price EUR:", p.priceEUR || "NOT SET");

      if (p.variants && p.variants.length > 0) {
        console.log("Variants:");
        p.variants.forEach((v) => {
          console.log(
            `  - ${v.name} | GBP: ${v.price} | EUR: ${v.priceEUR || "NOT SET"}`
          );
        });
      }
      console.log("");
    });

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkEURPrices();
