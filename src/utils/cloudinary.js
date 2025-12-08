import { v2 as cloudinary } from "cloudinary";

// Lazy configuration function - ensures env vars are loaded
let configured = false;
function ensureConfigured() {
  if (configured) return;

  // Configure Cloudinary with your credentials (from .env)
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // always use https URLs
  });

  // Validate configuration
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error("⚠️  Cloudinary credentials missing in .env file");
    console.error(
      "Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }

  configured = true;
}

/**
 * Upload an image to Cloudinary.
 * @param {string|Buffer} filePathOrBuffer - Local path of file to upload OR buffer from multer.
 * @param {string|object} folderOrOptions - Folder to upload to (e.g., 'services', 'specialists') OR full options object
 * @returns {Promise<object>} Cloudinary upload result with secure_url, public_id, etc.
 */
export async function uploadImage(
  filePathOrBuffer,
  folderOrOptions = "beauty-salon"
) {
  ensureConfigured();

  try {
    let result;

    if (Buffer.isBuffer(filePathOrBuffer)) {
      // Handle buffer upload (from multer memory storage)
      const options =
        typeof folderOrOptions === "string"
          ? {
              folder: folderOrOptions,
              use_filename: true,
              unique_filename: true,
              overwrite: false,
            }
          : {
              folder: "beauty-salon",
              use_filename: true,
              unique_filename: true,
              overwrite: false,
              ...folderOrOptions,
            };

      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          options,
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
        stream.end(filePathOrBuffer);
      });
    } else {
      // Handle file path upload (traditional way)
      const folder =
        typeof folderOrOptions === "string"
          ? folderOrOptions
          : folderOrOptions.folder || "beauty-salon";
      result = await cloudinary.uploader.upload(filePathOrBuffer, {
        folder: folder,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      });
    }

    console.log(`✅ Image uploaded to Cloudinary: ${result.secure_url}`);
    return result;
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    throw new Error(`Failed to upload image to Cloudinary: ${error.message}`);
  }
}

/**
 * Delete image by its public ID.
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<object>} Cloudinary deletion result
 */
export async function deleteImage(publicId) {
  ensureConfigured();
  return cloudinary.uploader.destroy(publicId);
}

export default cloudinary;
