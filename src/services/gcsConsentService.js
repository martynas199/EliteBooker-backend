import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createConsoleLogger } from '../utils/logger.js';

const LOG_GCS_CONSENT =
  process.env.LOG_GCS_CONSENT === 'true' || process.env.LOG_VERBOSE === 'true';
const console = createConsoleLogger({
  scope: 'gcs-consent-service',
  verbose: LOG_GCS_CONSENT,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GCSConsentService {
  constructor() {
    // Initialize GCS client
    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      keyFilename: process.env.GCS_KEY_FILE || path.join(__dirname, '../config/gcs-key.json')
    });
    
    this.bucketName = process.env.GCS_CONSENT_BUCKET || 'elitebooker-consents-eu';
    this.bucket = this.storage.bucket(this.bucketName);
    
    // Configuration
    this.signedUrlExpiry = 15 * 60 * 1000; // 15 minutes in milliseconds
  }

  /**
   * Initialize bucket (run once during setup)
   */
  async initializeBucket() {
    try {
      const [exists] = await this.bucket.exists();
      
      if (!exists) {
        console.log(`Creating bucket: ${this.bucketName}`);
        await this.storage.createBucket(this.bucketName, {
          location: 'europe-west1',
          storageClass: 'STANDARD',
          uniformBucketLevelAccess: { enabled: true },
          versioning: { enabled: true }
        });
        console.log(`Bucket ${this.bucketName} created successfully`);
      }
      
      // Set lifecycle rules (optional: archive old versions after 90 days)
      await this.bucket.setMetadata({
        lifecycle: {
          rule: [
            {
              action: { type: 'SetStorageClass', storageClass: 'NEARLINE' },
              condition: {
                daysSinceNoncurrentTime: 90,
                matchesPrefix: ['consents/']
              }
            }
          ]
        }
      });
      
      // Set CORS configuration (if needed for direct uploads)
      await this.bucket.setCorsConfiguration([
        {
          maxAgeSeconds: 3600,
          method: ['GET', 'HEAD'],
          origin: ['*'],
          responseHeader: ['Content-Type']
        }
      ]);
      
      console.log('Bucket configuration updated successfully');
      return true;
    } catch (error) {
      console.error('Error initializing bucket:', error);
      throw error;
    }
  }

  /**
   * Generate object path for consent PDF
   * Format: consents/business_{id}/client_{id}/appointment_{id}/consent_{id}_v{version}.pdf
   */
  generateObjectPath(businessId, clientId, appointmentId, consentId, version) {
    const businessPath = `business_${businessId}`;
    const clientPath = `client_${clientId}`;
    const appointmentPath = appointmentId ? `appointment_${appointmentId}` : 'no_appointment';
    const filename = `consent_${consentId}_v${version}.pdf`;
    
    return `consents/${businessPath}/${clientPath}/${appointmentPath}/${filename}`;
  }

  /**
   * Upload consent PDF to GCS
   * @param {Buffer} pdfBuffer - PDF file as buffer
   * @param {Object} metadata - Consent metadata
   * @returns {Promise<Object>} Upload result with GCS path and generation
   */
  async uploadConsentPDF(pdfBuffer, metadata) {
    const {
      businessId,
      clientId,
      appointmentId,
      consentId,
      consentVersion,
      signedByName,
      signedAt,
      ipAddress
    } = metadata;
    
    try {
      // Generate object path
      const objectPath = this.generateObjectPath(
        businessId,
        clientId,
        appointmentId,
        consentId,
        consentVersion
      );
      
      // Calculate PDF hash for integrity verification
      const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
      
      // Create file reference
      const file = this.bucket.file(objectPath);
      
      // Upload PDF with metadata
      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: {
          metadata: {
            businessId: businessId.toString(),
            clientId: clientId.toString(),
            appointmentId: appointmentId ? appointmentId.toString() : 'none',
            consentId: consentId.toString(),
            consentVersion: consentVersion.toString(),
            signedByName,
            signedAt: signedAt.toISOString(),
            ipAddress,
            pdfHash,
            uploadedAt: new Date().toISOString(),
            immutable: 'true'  // Flag indicating this should never be modified
          }
        },
        validation: 'md5',
        gzip: false,  // Don't compress PDFs
        public: false  // Private by default
      });
      
      // Get file metadata including generation number
      const [fileMetadata] = await file.getMetadata();
      
      console.log(`Consent PDF uploaded successfully: ${objectPath}`);
      
      return {
        gcsObjectPath: objectPath,
        gcsGeneration: fileMetadata.generation,
        pdfHash,
        uploadedAt: new Date()
      };
    } catch (error) {
      console.error('Error uploading consent PDF:', error);
      throw new Error(`Failed to upload consent PDF: ${error.message}`);
    }
  }

  /**
   * Generate signed URL for secure PDF access
   * @param {String} objectPath - GCS object path
   * @param {Number} expiryMinutes - URL expiry in minutes (default: 15)
   * @returns {Promise<String>} Signed URL
   */
  async generateSignedUrl(objectPath, expiryMinutes = 15) {
    try {
      const file = this.bucket.file(objectPath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`Consent PDF not found: ${objectPath}`);
      }
      
      // Generate signed URL
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + (expiryMinutes * 60 * 1000),
        responseDisposition: 'inline',  // Display in browser instead of download
        responseType: 'application/pdf'
      });
      
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Generate signed URL for PDF download
   */
  async generateDownloadUrl(objectPath, filename = 'consent-form.pdf') {
    try {
      const file = this.bucket.file(objectPath);
      
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + this.signedUrlExpiry,
        responseDisposition: `attachment; filename="${filename}"`,
        responseType: 'application/pdf'
      });
      
      return signedUrl;
    } catch (error) {
      console.error('Error generating download URL:', error);
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  /**
   * Verify PDF integrity
   */
  async verifyPDFIntegrity(objectPath, expectedHash) {
    try {
      const file = this.bucket.file(objectPath);
      
      // Download PDF
      const [pdfBuffer] = await file.download();
      
      // Calculate hash
      const actualHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
      
      return actualHash === expectedHash;
    } catch (error) {
      console.error('Error verifying PDF integrity:', error);
      return false;
    }
  }

  /**
   * Delete consent PDF (for GDPR right to erasure)
   */
  async deleteConsentPDF(objectPath) {
    try {
      const file = this.bucket.file(objectPath);
      
      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.warn(`File not found for deletion: ${objectPath}`);
        return true;
      }
      
      // Delete file
      await file.delete();
      
      console.log(`Consent PDF deleted: ${objectPath}`);
      return true;
    } catch (error) {
      console.error('Error deleting consent PDF:', error);
      throw new Error(`Failed to delete consent PDF: ${error.message}`);
    }
  }

  /**
   * Get PDF metadata
   */
  async getPDFMetadata(objectPath) {
    try {
      const file = this.bucket.file(objectPath);
      const [metadata] = await file.getMetadata();
      
      return {
        size: metadata.size,
        contentType: metadata.contentType,
        created: metadata.timeCreated,
        updated: metadata.updated,
        generation: metadata.generation,
        customMetadata: metadata.metadata
      };
    } catch (error) {
      console.error('Error getting PDF metadata:', error);
      throw new Error(`Failed to get PDF metadata: ${error.message}`);
    }
  }

  /**
   * List all consents for a client
   */
  async listClientConsents(businessId, clientId) {
    try {
      const prefix = `consents/business_${businessId}/client_${clientId}/`;
      
      const [files] = await this.bucket.getFiles({ prefix });
      
      return files.map(file => ({
        objectPath: file.name,
        metadata: file.metadata
      }));
    } catch (error) {
      console.error('Error listing client consents:', error);
      throw new Error(`Failed to list client consents: ${error.message}`);
    }
  }

  /**
   * Copy consent PDF to new location (for migrations)
   */
  async copyConsentPDF(sourceObjectPath, destinationObjectPath) {
    try {
      const sourceFile = this.bucket.file(sourceObjectPath);
      
      await sourceFile.copy(this.bucket.file(destinationObjectPath));
      
      console.log(`Consent PDF copied: ${sourceObjectPath} -> ${destinationObjectPath}`);
      return true;
    } catch (error) {
      console.error('Error copying consent PDF:', error);
      throw new Error(`Failed to copy consent PDF: ${error.message}`);
    }
  }

  /**
   * Get storage usage stats
   */
  async getStorageStats(businessId = null) {
    try {
      const prefix = businessId 
        ? `consents/business_${businessId}/`
        : 'consents/';
      
      const [files] = await this.bucket.getFiles({ prefix });
      
      const stats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + parseInt(file.metadata.size || 0), 0),
        oldestFile: null,
        newestFile: null
      };
      
      if (files.length > 0) {
        const sorted = files.sort((a, b) => 
          new Date(a.metadata.timeCreated) - new Date(b.metadata.timeCreated)
        );
        stats.oldestFile = sorted[0].metadata.timeCreated;
        stats.newestFile = sorted[sorted.length - 1].metadata.timeCreated;
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting storage stats:', error);
      throw new Error(`Failed to get storage stats: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new GCSConsentService();
