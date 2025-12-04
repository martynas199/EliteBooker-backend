import express from "express";
import User from "../models/User.js";
import Product from "../models/Product.js";
import { authenticateUser } from "../middleware/userAuth.js";

const router = express.Router();

// Get user's wishlist
router.get("/", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: "wishlist",
      match: { active: true }, // Only show active products
      select:
        "title description price originalPrice image images variants category featured active",
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Filter out null values (deleted/inactive products)
    const wishlist = user.wishlist.filter((item) => item !== null);

    res.json({ wishlist });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});

// Add product to wishlist
router.post("/", authenticateUser, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    // Check if product exists and is active
    const product = await Product.findOne({ _id: productId, active: true });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already in wishlist
    if (user.wishlist.includes(productId)) {
      return res.status(400).json({ error: "Product already in wishlist" });
    }

    // Add to wishlist
    user.wishlist.push(productId);
    await user.save();

    res.json({ message: "Product added to wishlist", wishlist: user.wishlist });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
});

// Remove product from wishlist
router.delete("/:productId", authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove from wishlist
    user.wishlist = user.wishlist.filter((id) => id.toString() !== productId);
    await user.save();

    res.json({
      message: "Product removed from wishlist",
      wishlist: user.wishlist,
    });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
});

// Toggle product in wishlist (add if not present, remove if present)
router.post("/toggle", authenticateUser, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const index = user.wishlist.findIndex((id) => id.toString() === productId);

    let message;
    if (index > -1) {
      // Remove from wishlist
      user.wishlist.splice(index, 1);
      message = "Product removed from wishlist";
    } else {
      // Check if product exists and is active
      const product = await Product.findOne({ _id: productId, active: true });
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      // Add to wishlist
      user.wishlist.push(productId);
      message = "Product added to wishlist";
    }

    await user.save();

    res.json({ message, wishlist: user.wishlist, inWishlist: index === -1 });
  } catch (error) {
    console.error("Error toggling wishlist:", error);
    res.status(500).json({ error: "Failed to toggle wishlist" });
  }
});

// Clear entire wishlist
router.delete("/", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.wishlist = [];
    await user.save();

    res.json({ message: "Wishlist cleared" });
  } catch (error) {
    console.error("Error clearing wishlist:", error);
    res.status(500).json({ error: "Failed to clear wishlist" });
  }
});

export default router;
