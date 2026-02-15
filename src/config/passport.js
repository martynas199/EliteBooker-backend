// Load environment variables first (MUST be first import)
import "./env.js";

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import AppleStrategy from "passport-apple";
import Client from "../models/Client.js";
import { createConsoleLogger } from "../utils/logger.js";

const LOG_OAUTH =
  process.env.LOG_OAUTH === "true" || process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({
  scope: "passport-config",
  verbose: LOG_OAUTH,
});

// Serialize client for session
passport.serializeUser((client, done) => {
  done(null, client._id);
});

// Deserialize client from session
passport.deserializeUser(async (id, done) => {
  try {
    const client = await Client.findById(id);
    done(null, client);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth Strategy - Configuration
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log("[OAUTH] ✓ Google OAuth configured successfully");
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${
          process.env.BACKEND_URL || "http://localhost:4000"
        }/api/oauth/google/callback`,
        passReqToCallback: false,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails && profile.emails[0]
              ? profile.emails[0].value
              : null;

          if (!email) {
            return done(new Error("No email from Google profile"), null);
          }

          // Get profile picture from Google
          const avatar =
            profile.photos && profile.photos[0]
              ? profile.photos[0].value
              : null;

          // Check if client exists with this Google ID
          let client = await Client.findOne({ googleId: profile.id });

          if (!client) {
            // Check if client exists with this email
            client = await Client.findOne({ email: email.toLowerCase() });

            if (client) {
              // Link Google account to existing client
              client.googleId = profile.id;
              if (!client.authProvider || client.authProvider === "email") {
                client.authProvider = "google";
              }
              if (avatar) {
                client.avatar = avatar;
              }
              client.lastActivity = new Date();
              await client.save();
            } else {
              // Create new client (global platform-wide identity)
              client = await Client.create({
                name: profile.displayName || "Google User",
                email: email.toLowerCase(),
                googleId: profile.id,
                authProvider: "google",
                avatar: avatar,
                isEmailVerified: true, // Google emails are verified
                totalBookings: 0,
                memberSince: new Date(),
                lastActivity: new Date(),
                isActive: true,
              });
            }
          } else {
            // Update last activity and avatar
            client.lastActivity = new Date();
            if (avatar) {
              client.avatar = avatar;
            }
            await client.save();
          }

          return done(null, client);
        } catch (err) {
          console.error("[OAUTH] Google strategy error:", err);
          return done(err, null);
        }
      }
    )
  );
} else {
  console.warn(
    "[OAUTH] Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET"
  );
}

// Apple OAuth Strategy
if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY
) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: process.env.APPLE_PRIVATE_KEY,
        callbackURL: `${
          process.env.BACKEND_URL || "http://localhost:4000"
        }/api/oauth/apple/callback`,
        passReqToCallback: false,
      },
      async (accessToken, refreshToken, idToken, profile, done) => {
        try {
          // Apple profile structure is different
          const email = profile.email || (idToken && idToken.email);

          if (!email) {
            return done(new Error("No email from Apple profile"), null);
          }

          // Check if client exists with this Apple ID
          let client = await Client.findOne({ appleId: profile.id });

          if (!client) {
            // Check if client exists with this email
            client = await Client.findOne({ email: email.toLowerCase() });

            if (client) {
              // Link Apple account to existing client
              client.appleId = profile.id;
              if (!client.authProvider || client.authProvider === "email") {
                client.authProvider = "apple";
              }
              client.lastActivity = new Date();
              await client.save();
            } else {
              // Create new client (global platform-wide identity)
              const name = profile.name
                ? `${profile.name.firstName || ""} ${
                    profile.name.lastName || ""
                  }`.trim()
                : "Apple User";

              client = await Client.create({
                name: name || "Apple User",
                email: email.toLowerCase(),
                appleId: profile.id,
                authProvider: "apple",
                isEmailVerified: true, // Apple emails are verified
                totalBookings: 0,
                memberSince: new Date(),
                lastActivity: new Date(),
                isActive: true,
              });
            }
          } else {
            // Update last activity
            client.lastActivity = new Date();
            await client.save();
          }

          return done(null, client);
        } catch (err) {
          console.error("[OAUTH] Apple strategy error:", err);
          return done(err, null);
        }
      }
    )
  );
} else {
  console.warn(
    "[OAUTH] Apple OAuth not configured - missing required environment variables"
  );
}

export default passport;
