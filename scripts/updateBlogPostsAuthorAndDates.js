import dotenv from "dotenv";
import mongoose from "mongoose";
import BlogPost from "../src/models/BlogPost.js";
import Admin from "../src/models/Admin.js";

dotenv.config();

async function updateBlogPosts() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // Find or create admin with name "Remi"
    let remiAdmin = await Admin.findOne({ name: "Remi" });

    if (!remiAdmin) {
      console.log('Creating new admin "Remi"...');
      // Get an existing admin to copy some fields
      const existingAdmin = await Admin.findOne();

      remiAdmin = await Admin.create({
        name: "Remi",
        email: "remi@nobleelegance.com",
        password: existingAdmin?.password || "tempPassword123!", // Will need to be reset
        role: "admin",
        active: true,
      });
      console.log('✓ Created admin "Remi"');
    } else {
      console.log('✓ Found existing admin "Remi"');
    }

    // Get all blog posts
    const blogPosts = await BlogPost.find().sort({ createdAt: 1 });
    console.log(`\nFound ${blogPosts.length} blog posts to update`);

    // Generate dates spread over the past 6 months (more realistic)
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    // Calculate time interval between posts
    const timeSpan = today.getTime() - sixMonthsAgo.getTime();
    const interval = timeSpan / (blogPosts.length - 1);

    let updatedCount = 0;

    for (let i = 0; i < blogPosts.length; i++) {
      const post = blogPosts[i];

      // Calculate date for this post (spread evenly over 6 months)
      // Add some randomness (±2 days) to make it more natural
      const randomDays = Math.floor(Math.random() * 5) - 2; // -2 to +2 days
      const postDate = new Date(
        sixMonthsAgo.getTime() + interval * i + randomDays * 24 * 60 * 60 * 1000
      );

      // Update author and publishedAt
      post.author = remiAdmin._id;
      post.publishedAt = postDate;

      await post.save();
      updatedCount++;

      console.log(
        `✓ Updated: ${post.title.substring(
          0,
          50
        )}... (${postDate.toLocaleDateString()})`
      );
    }

    console.log(`\n✅ Successfully updated ${updatedCount} blog posts`);
    console.log(`   - Author changed to: Remi`);
    console.log(
      `   - Dates spread from ${sixMonthsAgo.toLocaleDateString()} to ${today.toLocaleDateString()}`
    );
  } catch (error) {
    console.error("✗ Error updating blog posts:", error);
  } finally {
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
  }
}

updateBlogPosts();
