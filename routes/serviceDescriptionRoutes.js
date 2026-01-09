const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const OpenAI = require("openai");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @route   POST /api/services/generate-description
 * @desc    Generate AI service description
 * @access  Private (Admin only)
 */
router.post("/generate-description", protect, async (req, res) => {
  try {
    const {
      serviceTitle,
      businessType,
      country = "UK",
      serviceDuration,
      serviceCategory,
    } = req.body;

    // Validation
    if (!serviceTitle || serviceTitle.trim().length <= 3) {
      return res.status(400).json({
        success: false,
        message: "Service title must be at least 4 characters long",
      });
    }

    // Check if user has permission (must be admin/staff)
    if (!req.user || !req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Admin access required",
      });
    }

    // Build context string for the prompt
    let contextString = `Service: ${serviceTitle}`;
    if (businessType) contextString += `\nBusiness Type: ${businessType}`;
    if (serviceCategory) contextString += `\nCategory: ${serviceCategory}`;
    if (serviceDuration)
      contextString += `\nDuration: ${serviceDuration} minutes`;
    if (country) contextString += `\nCountry: ${country}`;

    // Safety-focused system prompt
    const systemPrompt = `You are a professional service description writer for a booking platform used by beauty salons, wellness centers, and clinics.

Your task is to write SAFE, NEUTRAL, CLIENT-FACING service descriptions.

## CRITICAL SAFETY RULES (MUST FOLLOW):
1. NO medical claims or health guarantees
2. NO promises of specific outcomes or results
3. NO diagnosis or treatment advice
4. NO words like "best", "guaranteed", "permanent", "cure", "treat"
5. NO regulatory or certification claims unless explicitly stated
6. Use SAFE phrases: "designed to", "commonly used for", "may help improve", "suitable for"

## Writing Style:
- Professional and informative tone
- Simple, clear English (readable by general public)
- 2-4 short paragraphs OR bullet-friendly format
- Client-facing language (avoid technical jargon)
- Similar tone to Fresha, Treatwell, Booksy

## What to INCLUDE:
- What the service involves
- General purpose/use case
- What clients can typically expect (process, not results)
- Duration context (if provided)
- Mention consultation if relevant

## What to EXCLUDE:
- Emojis
- Markdown formatting (plain text only)
- Medical terminology or diagnoses
- Pricing information
- Specific contraindications (unless very general)
- Marketing hype or exaggeration

## Output Format:
Return ONLY the description text. No title, no extra commentary.`;

    const userPrompt = `Generate a professional service description for:

${contextString}

Write 2-4 short paragraphs that:
1. EXPLAIN what this service actually is (the technique, procedure, or treatment involved)
2. Describe what happens during the appointment
3. Mention what clients can typically expect from the experience
4. Include any relevant preparation or aftercare notes if applicable

Be specific and educational. Don't just repeat the service name - actually explain what it involves. Keep it safe, neutral, and informative. No medical claims or guarantees.`;

    console.log("🤖 Generating AI description for:", serviceTitle);
    console.log("📝 Context:", contextString);
    console.log("\n📋 SYSTEM PROMPT:");
    console.log(systemPrompt);
    console.log("\n📝 USER PROMPT:");
    console.log(userPrompt);
    console.log("\n🔄 Making OpenAI API call...\n");

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    });

    const generatedDescription = completion.choices[0].message.content.trim();

    // Additional safety check: scan for forbidden words
    const forbiddenWords = [
      "guaranteed",
      "guarantee",
      "permanent",
      "cure",
      "cures",
      "treat disease",
      "medical condition",
      "diagnose",
      "prescription",
      "FDA approved",
      "clinically proven",
    ];

    const lowerDescription = generatedDescription.toLowerCase();
    const foundForbiddenWords = forbiddenWords.filter((word) =>
      lowerDescription.includes(word.toLowerCase())
    );

    if (foundForbiddenWords.length > 0) {
      console.warn(
        "⚠️ Generated description contains forbidden words:",
        foundForbiddenWords
      );
      // Return a safe fallback
      return res.status(200).json({
        success: true,
        data: {
          description: `This service provides ${serviceTitle.toLowerCase()}. A consultation is recommended to ensure this service is suitable for your needs. Please contact us for more information about what to expect during your appointment.`,
          source: "fallback",
          warning:
            "AI-generated description contained restricted terms. Using safe fallback.",
        },
      });
    }

    // Log usage for monitoring
    console.log("✅ AI description generated successfully");
    console.log("📊 Tokens used:", completion.usage.total_tokens);

    res.status(200).json({
      success: true,
      data: {
        description: generatedDescription,
        source: "openai",
        model: "gpt-3.5-turbo",
        tokensUsed: completion.usage.total_tokens,
      },
    });
  } catch (error) {
    console.error("❌ Error generating AI description:", error);

    // Handle specific OpenAI errors
    if (error.code === "insufficient_quota") {
      return res.status(503).json({
        success: false,
        message:
          "AI service temporarily unavailable. Please enter description manually.",
        error: "quota_exceeded",
      });
    }

    if (error.code === "invalid_api_key") {
      return res.status(500).json({
        success: false,
        message: "AI service configuration error. Please contact support.",
        error: "configuration_error",
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message:
        "Failed to generate description. Please enter description manually.",
      error: error.message,
    });
  }
});

module.exports = router;
