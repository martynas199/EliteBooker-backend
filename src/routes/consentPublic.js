import express from 'express';
import jwt from 'jsonwebtoken';
import ConsentTemplate from '../models/ConsentTemplate.js';
import ConsentRecord from '../models/ConsentRecord.js';

const router = express.Router();

/**
 * GET /api/public/consent-link/:token
 * Get consent form for signing via link (email/SMS)
 * Token contains: { templateId, clientId, appointmentId, expiresAt }
 */
router.get('/consent-link/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired consent link'
      });
    }
    
    const { templateId, clientId, appointmentId } = decoded;
    
    // Get template
    const template = await ConsentTemplate.findById(templateId)
      .populate('requiredFor.services', 'name category');
    
    if (!template || template.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Consent form not found or no longer active'
      });
    }
    
    // Get client info
    const { default: Client } = await import('../models/Client.js');
    const client = await Client.findById(clientId).select('name email phone');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    // Check if already signed
    const existingConsent = await ConsentRecord.findOne({
      clientId,
      consentTemplateId: templateId,
      appointmentId,
      status: 'signed'
    });
    
    if (existingConsent) {
      return res.json({
        success: true,
        alreadySigned: true,
        data: {
          consentRecord: existingConsent,
          message: 'You have already signed this consent form'
        }
      });
    }
    
    // Return template for signing
    res.json({
      success: true,
      alreadySigned: false,
      data: {
        template: {
          id: template._id,
          name: template.name,
          version: template.version,
          sections: template.sections
        },
        client: {
          id: client._id,
          name: client.name,
          email: client.email,
          phone: client.phone
        },
        appointmentId
      }
    });
  } catch (error) {
    console.error('Error fetching consent link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load consent form',
      error: error.message
    });
  }
});

/**
 * POST /api/public/consent-link/:token/sign
 * Sign consent via public link
 */
router.post('/consent-link/:token/sign', async (req, res) => {
  try {
    const { token } = req.params;
    const { signedByName, signatureData } = req.body;
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired consent link'
      });
    }
    
    const { templateId, clientId, appointmentId } = decoded;
    
    // Validation
    if (!signedByName || !signatureData) {
      return res.status(400).json({
        success: false,
        message: 'Name and signature are required'
      });
    }
    
    // Call the main consent signing endpoint logic
    const consentsRouter = require('./consents');
    
    // Create a pseudo-request for the consent signing
    const signRequest = {
      body: {
        consentTemplateId: templateId,
        clientId,
        appointmentId,
        signedByName,
        signatureData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      },
      ip: req.ip,
      get: (header) => req.get(header)
    };
    
    // Import and use the signing service directly
    const { default: ConsentTemplateModel } = await import('../models/ConsentTemplate.js');
    const { default: pdfGenerationService } = await import('../services/pdfGenerationService.js');
    const { default: gcsConsentService } = await import('../services/gcsConsentService.js');
    const { default: crypto } = await import('crypto');
    
    const template = await ConsentTemplateModel.findById(templateId);
    if (!template || template.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Consent template not found'
      });
    }
    
    const { default: Business } = await import('../models/Business.js');
    const { default: Client } = await import('../models/Client.js');
    
    const business = await Business.findById(template.businessId);
    const client = await Client.findById(clientId);
    
    if (!business || !client) {
      return res.status(404).json({
        success: false,
        message: 'Business or client not found'
      });
    }
    
    const signedAt = new Date();
    
    // Generate PDF
    const pdfData = {
      templateName: template.name,
      templateVersion: template.version,
      sections: template.sections,
      signedByName,
      signatureData,
      signedAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      clientName: client.name,
      businessName: business.name,
      businessLogo: business.logo || null
    };
    
    const pdfBuffer = await pdfGenerationService.generateConsentPDF(pdfData);
    
    // Create consent record
    const consentRecord = new ConsentRecord({
      businessId: template.businessId,
      clientId,
      appointmentId: appointmentId || null,
      consentTemplateId: template._id,
      templateVersion: template.version,
      templateName: template.name,
      templateContent: template.sections,
      signedByName,
      signatureData,
      signedAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      gcsObjectPath: 'pending',
      pdfGeneratedAt: new Date(),
      pdfHash: crypto.createHash('sha256').update(pdfBuffer).digest('hex')
    });
    
    await consentRecord.save();
    
    // Upload PDF to GCS
    const uploadResult = await gcsConsentService.uploadConsentPDF(pdfBuffer, {
      businessId: template.businessId,
      clientId,
      appointmentId: appointmentId || null,
      consentId: consentRecord._id,
      consentVersion: template.version,
      signedByName,
      signedAt,
      ipAddress: req.ip
    });
    
    // Update consent record
    consentRecord.gcsObjectPath = uploadResult.gcsObjectPath;
    consentRecord.gcsGeneration = uploadResult.gcsGeneration;
    await consentRecord.save();
    
    res.status(201).json({
      success: true,
      message: 'Consent signed successfully',
      data: {
        consentId: consentRecord._id,
        message: 'Thank you for signing the consent form. You will receive a copy via email.'
      }
    });
  } catch (error) {
    console.error('Error signing consent via link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sign consent',
      error: error.message
    });
  }
});

/**
 * GET /api/public/consent/:id/track
 * Track email open (pixel tracking)
 */
router.get('/consent/:id/track', async (req, res) => {
  try {
    const { id } = req.params;
    
    const consent = await ConsentRecord.findById(id);
    if (consent) {
      await consent.markEmailOpened();
    }
    
    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.set('Content-Type', 'image/png');
    res.send(pixel);
  } catch (error) {
    console.error('Error tracking email:', error);
    res.status(200).end();
  }
});

/**
 * POST /api/public/consent/generate-link
 * Generate consent signing link (used by backend for email/SMS)
 */
router.post('/generate-link', async (req, res) => {
  try {
    const { templateId, clientId, appointmentId, expiresInHours = 72 } = req.body;
    
    // Verify template exists
    const template = await ConsentTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        templateId,
        clientId,
        appointmentId: appointmentId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: `${expiresInHours}h` }
    );
    
    const baseUrl = process.env.FRONTEND_URL || 'https://elitebooker.com';
    const consentLink = `${baseUrl}/consent/${token}`;
    
    res.json({
      success: true,
      data: {
        token,
        link: consentLink,
        expiresIn: `${expiresInHours} hours`
      }
    });
  } catch (error) {
    console.error('Error generating consent link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate consent link',
      error: error.message
    });
  }
});

export default router;
