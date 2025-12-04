/**
 * Multi-Tenant Mongoose Plugin
 *
 * Automatically adds tenantId to all documents and filters queries by tenant.
 * This ensures complete data isolation between tenants.
 *
 * Usage:
 * import { multiTenantPlugin } from './middleware/multiTenantPlugin.js';
 * schema.plugin(multiTenantPlugin);
 */

import mongoose from "mongoose";

/**
 * Plugin to add multi-tenant support to a schema
 * @param {mongoose.Schema} schema - Mongoose schema to add multi-tenancy to
 * @param {Object} options - Plugin options
 * @param {boolean} options.index - Whether to index tenantId field (default: true)
 * @param {boolean} options.required - Whether tenantId is required (default: true)
 */
export function multiTenantPlugin(schema, options = {}) {
  const { index = true, required = true } = options;

  // Add tenantId field to schema
  schema.add({
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required,
      index,
    },
  });

  // AUTOMATIC TENANT FILTERING - Query middleware

  /**
   * Automatically filter by tenantId for all find queries
   * Uses req.tenantId from the request context
   */
  function addTenantFilter(next) {
    // Get tenant ID from query options (set by middleware)
    const tenantId = this.getOptions().tenantId;

    if (tenantId) {
      // Add tenantId to the query filter
      this.where({ tenantId });
    }

    next();
  }

  // Apply to all read operations
  schema.pre("find", addTenantFilter);
  schema.pre("findOne", addTenantFilter);
  schema.pre("findOneAndUpdate", addTenantFilter);
  schema.pre("findOneAndReplace", addTenantFilter);
  schema.pre("findOneAndDelete", addTenantFilter);
  schema.pre("count", addTenantFilter);
  schema.pre("countDocuments", addTenantFilter);
  schema.pre("estimatedDocumentCount", addTenantFilter);

  // Apply to update operations
  schema.pre("updateOne", addTenantFilter);
  schema.pre("updateMany", addTenantFilter);
  schema.pre("deleteOne", addTenantFilter);
  schema.pre("deleteMany", addTenantFilter);

  /**
   * Automatically attach tenantId to new documents
   * Uses req.tenantId from the request context
   */
  schema.pre("save", function (next) {
    // Get tenant ID from options (set by middleware)
    if (!this.tenantId && this.$__.saveOptions?.tenantId) {
      this.tenantId = this.$__.saveOptions.tenantId;
    }

    // Validate tenantId exists before saving
    if (!this.tenantId && required) {
      return next(
        new Error(
          "tenantId is required. Please ensure tenant context is set in middleware."
        )
      );
    }

    next();
  });

  /**
   * Prevent tenantId modification after creation
   */
  schema.pre("save", function (next) {
    if (!this.isNew && this.isModified("tenantId")) {
      return next(new Error("tenantId cannot be modified after creation"));
    }
    next();
  });

  // Add index for better query performance
  if (index) {
    schema.index({ tenantId: 1 });
  }

  // Add static method to set tenant context for testing
  schema.statics.setTenantContext = function (tenantId) {
    // Store tenant context in a static variable
    this._tenantContext = tenantId;

    // Override model methods to use this context
    const originalFind = this.find;
    const originalFindOne = this.findOne;
    const originalFindById = this.findById;
    const originalCreate = this.create;
    const originalUpdateOne = this.updateOne;
    const originalUpdateMany = this.updateMany;
    const originalDeleteOne = this.deleteOne;
    const originalDeleteMany = this.deleteMany;
    const originalCountDocuments = this.countDocuments;

    this.find = function (...args) {
      const query = originalFind.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.findOne = function (...args) {
      const query = originalFindOne.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.findById = function (...args) {
      const query = originalFindById.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.updateOne = function (...args) {
      const query = originalUpdateOne.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.updateMany = function (...args) {
      const query = originalUpdateMany.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.deleteOne = function (...args) {
      const query = originalDeleteOne.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.deleteMany = function (...args) {
      const query = originalDeleteMany.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.countDocuments = function (...args) {
      const query = originalCountDocuments.apply(this, args);
      if (this._tenantContext) {
        query.setOptions({ tenantId: this._tenantContext });
      }
      return query;
    };

    this.create = async function (...args) {
      const docs = args[0];
      if (this._tenantContext) {
        if (Array.isArray(docs)) {
          docs.forEach((doc) => {
            if (!doc.tenantId) doc.tenantId = this._tenantContext;
          });
        } else if (typeof docs === "object" && !docs.tenantId) {
          docs.tenantId = this._tenantContext;
        }
      }
      return originalCreate.apply(this, args);
    };
  };
}

/**
 * Helper function to set tenant context on a query
 * @param {mongoose.Query} query - Mongoose query
 * @param {string|ObjectId} tenantId - Tenant ID
 * @returns {mongoose.Query} Query with tenant context
 */
export function setTenantContext(query, tenantId) {
  return query.setOptions({ tenantId });
}

/**
 * Helper function to set tenant context on a document before saving
 * @param {mongoose.Document} doc - Mongoose document
 * @param {string|ObjectId} tenantId - Tenant ID
 * @returns {mongoose.Document} Document with tenant context
 */
export function setDocumentTenantContext(doc, tenantId) {
  if (!doc.$__.saveOptions) {
    doc.$__.saveOptions = {};
  }
  doc.$__.saveOptions.tenantId = tenantId;
  return doc;
}

/**
 * Express middleware to attach tenant context to Mongoose operations
 * Should be used after tenant resolution middleware
 */
export function attachTenantToModels(req, res, next) {
  console.log("[attachTenantToModels] Called with tenantId:", req.tenantId);

  if (!req.tenantId) {
    // No tenant context - skip for public routes or handle error
    console.log("[attachTenantToModels] No tenantId, skipping");
    return next();
  }

  console.log(
    "[attachTenantToModels] Setting up Mongoose overrides for tenantId:",
    req.tenantId
  );

  // Store original methods
  const originalExec = mongoose.Query.prototype.exec;
  const originalSave = mongoose.Model.prototype.save;

  // Override Query.exec to add tenant context
  mongoose.Query.prototype.exec = function (callback) {
    if (!this.getOptions().tenantId) {
      this.setOptions({ tenantId: req.tenantId });
    }
    return originalExec.call(this, callback);
  };

  // Override Model.save to add tenant context
  mongoose.Model.prototype.save = function (options) {
    if (!this.$__.saveOptions) {
      this.$__.saveOptions = {};
    }
    if (!this.$__.saveOptions.tenantId) {
      this.$__.saveOptions.tenantId = req.tenantId;
    }
    return originalSave.call(this, options);
  };

  // Restore original methods after request
  res.on("finish", () => {
    mongoose.Query.prototype.exec = originalExec;
    mongoose.Model.prototype.save = originalSave;
  });

  next();
}

export default multiTenantPlugin;
