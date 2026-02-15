import express from "express";
import { z } from "zod";
import { requireAdmin, requireSuperAdmin } from "../middleware/requireAdmin.js";
import BlogPost from "../models/BlogPost.js";
import {
  applyQueryOptimizations,
  executePaginatedQuery,
  MAX_LIMIT,
} from "../utils/queryHelpers.js";
import { createConsoleLogger } from "../utils/logger.js";

const router = express.Router();
const LOG_BLOG_POSTS =
  process.env.LOG_BLOG_POSTS === "true" ||
  process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({
  scope: "blog-posts-route",
  verbose: LOG_BLOG_POSTS,
});

// Validation schemas
const CreateBlogPostSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be under 200 characters"),
  excerpt: z
    .string()
    .max(500, "Excerpt must be under 500 characters")
    .optional(),
  content: z.string().min(1, "Content is required"),
  status: z.enum(["draft", "published"]).default("draft"),
  tags: z.array(z.string()).optional(),
});

const UpdateBlogPostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/blog-posts - Public route to get all published blog posts
router.get("/", async (req, res) => {
  try {
    // Build query - only published posts for public
    const query = { status: "published" };

    if (req.query.tag) {
      query.tags = req.query.tag;
    }

    // Build optimized query with lean and projections
    let blogQuery = BlogPost.find(query).populate("author", "name").lean();

    // Apply pagination and optimizations with enforced MAX_LIMIT
    blogQuery = applyQueryOptimizations(blogQuery, req.query, {
      defaultSort: "-publishedAt",
      maxLimit: MAX_LIMIT,
      lean: false, // Already applied
    });

    // Execute with count caching
    const cacheKey = `blogposts:published:${req.query.tag || "all"}`;
    const result = await executePaginatedQuery(
      blogQuery,
      BlogPost,
      query,
      req.query,
      { useCache: true, cacheKey }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Error fetching blog posts:", error);
    res.status(500).json({
      error: "Failed to fetch blog posts",
      message: error.message,
    });
  }
});

// GET /api/blog-posts/admin - Admin route to get all blog posts (including drafts)
router.get("/admin", requireAdmin, async (req, res) => {
  try {
    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.tag) {
      query.tags = req.query.tag;
    }

    // Build optimized query
    let blogQuery = BlogPost.find(query)
      .populate("author", "name email")
      .lean();

    // Apply pagination and optimizations with enforced MAX_LIMIT
    blogQuery = applyQueryOptimizations(blogQuery, req.query, {
      defaultSort: "-createdAt",
      maxLimit: MAX_LIMIT,
      lean: false,
    });

    // Execute with caching
    const result = await executePaginatedQuery(
      blogQuery,
      BlogPost,
      query,
      req.query
    );

    const { data: posts, pagination: total } = result;

    res.json({
      success: true,
      data: posts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Admin error fetching blog posts:", error);
    res.status(500).json({
      error: "Failed to fetch blog posts",
      message: error.message,
    });
  }
});

// GET /api/blog-posts/:slug - Public route to get single blog post by slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const post = await BlogPost.findOne({
      slug,
      status: "published",
    })
      .populate("author", "name")
      .lean();

    if (!post) {
      return res.status(404).json({
        error: "Blog post not found",
        message: "The requested blog post does not exist or is not published.",
      });
    }

    res.json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Error fetching blog post:", error);
    res.status(500).json({
      error: "Failed to fetch blog post",
      message: error.message,
    });
  }
});

// POST /api/blog-posts - Admin route to create new blog post
router.post("/", requireAdmin, async (req, res) => {
  try {
    console.log("[BLOG-POSTS] Creating new blog post");

    const validatedData = CreateBlogPostSchema.parse(req.body);

    // Generate slug from title
    const slug = validatedData.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Check if slug already exists
    const existingPost = await BlogPost.findOne({ slug });
    if (existingPost) {
      return res.status(400).json({
        error: "Blog post with similar title already exists",
        message: "Please use a different title.",
      });
    }

    const blogPost = await BlogPost.create({
      ...validatedData,
      slug,
      author: req.admin.id,
    });

    const populatedPost = await BlogPost.findById(blogPost._id)
      .populate("author", "name email")
      .lean();

    console.log("[BLOG-POSTS] ✓ Blog post created successfully");

    res.status(201).json({
      success: true,
      message: "Blog post created successfully",
      data: populatedPost,
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Error creating blog post:", error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        message: error.errors[0]?.message || "Invalid input data",
        details: error.errors,
      });
    }

    res.status(500).json({
      error: "Failed to create blog post",
      message: error.message,
    });
  }
});

// PUT /api/blog-posts/:id - Admin route to update blog post
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    console.log("[BLOG-POSTS] Updating blog post:", req.params.id);

    const validatedData = UpdateBlogPostSchema.parse(req.body);

    const blogPost = await BlogPost.findById(req.params.id);

    if (!blogPost) {
      return res.status(404).json({
        error: "Blog post not found",
        message: "The requested blog post does not exist.",
      });
    }

    // If title is being updated, regenerate slug
    if (validatedData.title && validatedData.title !== blogPost.title) {
      const newSlug = validatedData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      // Check if new slug conflicts with existing post
      const existingPost = await BlogPost.findOne({
        slug: newSlug,
        _id: { $ne: req.params.id },
      });

      if (existingPost) {
        return res.status(400).json({
          error: "Blog post with similar title already exists",
          message: "Please use a different title.",
        });
      }

      validatedData.slug = newSlug;
    }

    // Update the blog post
    Object.assign(blogPost, validatedData);
    await blogPost.save();

    const updatedPost = await BlogPost.findById(blogPost._id)
      .populate("author", "name email")
      .lean();

    console.log("[BLOG-POSTS] ✓ Blog post updated successfully");

    res.json({
      success: true,
      message: "Blog post updated successfully",
      data: updatedPost,
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Error updating blog post:", error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        message: error.errors[0]?.message || "Invalid input data",
        details: error.errors,
      });
    }

    res.status(500).json({
      error: "Failed to update blog post",
      message: error.message,
    });
  }
});

// DELETE /api/blog-posts/:id - Admin route to delete blog post
router.delete("/:id", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    console.log("[BLOG-POSTS] Deleting blog post:", req.params.id);

    const blogPost = await BlogPost.findById(req.params.id);

    if (!blogPost) {
      return res.status(404).json({
        error: "Blog post not found",
        message: "The requested blog post does not exist.",
      });
    }

    await blogPost.deleteOne();

    console.log("[BLOG-POSTS] ✓ Blog post deleted successfully");

    res.json({
      success: true,
      message: "Blog post deleted successfully",
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Error deleting blog post:", error);
    res.status(500).json({
      error: "Failed to delete blog post",
      message: error.message,
    });
  }
});

// GET /api/blog-posts/tags/all - Public route to get all unique tags
router.get("/tags/all", async (req, res) => {
  try {
    const tags = await BlogPost.distinct("tags", { status: "published" });

    res.json({
      success: true,
      data: tags.sort(),
    });
  } catch (error) {
    console.error("[BLOG-POSTS] Error fetching tags:", error);
    res.status(500).json({
      error: "Failed to fetch tags",
      message: error.message,
    });
  }
});

export default router;
