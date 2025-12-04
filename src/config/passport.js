// Load environment variables first (MUST be first import)
import "./env.js";

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import AppleStrategy from "passport-apple";
import User from "../models/User.js";

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
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
        }/api/auth/google/callback`,
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

          // Check if user exists with this Google ID
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            // Check if user exists with this email (from email/password signup)
            user = await User.findOne({ email: email.toLowerCase() });

            if (user) {
              // Link Google account to existing user
              user.googleId = profile.id;
              if (!user.authProvider || user.authProvider === "local") {
                user.authProvider = "google";
              }
              await user.save();
            } else {
              // Create new user
              user = await User.create({
                name: profile.displayName || "Google User",
                email: email.toLowerCase(),
                googleId: profile.id,
                authProvider: "google",
                // No password needed for OAuth users
              });
            }
          }

          user.lastLogin = new Date();
          await user.save();

          return done(null, user);
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
        }/api/auth/apple/callback`,
        passReqToCallback: false,
      },
      async (accessToken, refreshToken, idToken, profile, done) => {
        try {
          // Apple profile structure is different
          const email = profile.email || (idToken && idToken.email);

          if (!email) {
            return done(new Error("No email from Apple profile"), null);
          }

          // Check if user exists with this Apple ID
          let user = await User.findOne({ appleId: profile.id });

          if (!user) {
            // Check if user exists with this email
            user = await User.findOne({ email: email.toLowerCase() });

            if (user) {
              // Link Apple account to existing user
              user.appleId = profile.id;
              if (!user.authProvider || user.authProvider === "local") {
                user.authProvider = "apple";
              }
              await user.save();
            } else {
              // Create new user
              const name = profile.name
                ? `${profile.name.firstName || ""} ${
                    profile.name.lastName || ""
                  }`.trim()
                : "Apple User";

              user = await User.create({
                name: name || "Apple User",
                email: email.toLowerCase(),
                appleId: profile.id,
                authProvider: "apple",
                // No password needed for OAuth users
              });
            }
          }

          user.lastLogin = new Date();
          await user.save();

          return done(null, user);
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
