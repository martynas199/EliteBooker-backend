import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config();

// Import models
import Admin from './src/models/Admin.js';
import Tenant from './src/models/Tenant.js';

async function fixAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find the tenant
    const tenant = await Tenant.findOne({ slug: 'luxe-lashes' });
    if (!tenant) {
      console.error('❌ Tenant not found');
      return;
    }
    console.log('✓ Found tenant:', tenant.businessName);

    // Delete existing admin
    await Admin.deleteOne({ email: 'admin@luxelashes.com' });
    console.log('🗑️ Deleted old admin');

    // Create new admin with PLAIN PASSWORD (let pre-save hook hash it)
    const newAdmin = await Admin.create({
      email: 'admin@luxelashes.com',
      password: 'LuxeLashes2024!', // PLAIN PASSWORD - model will hash it
      name: 'Luxe Lashes Admin',
      role: 'salon-admin',
      active: true,
      tenantId: tenant._id
    });

    console.log('✨ Created new admin:', newAdmin._id);

    // Update tenant owner
    tenant.owner = newAdmin._id;
    await tenant.save();
    console.log('✓ Tenant owner updated');

    // Test login by finding admin with password field selected
    const testAdmin = await Admin.findOne({ email: 'admin@luxelashes.com' }).select('+password');
    const isMatch = await testAdmin.comparePassword('LuxeLashes2024!');
    
    console.log('\n🔍 Password verification test:', isMatch ? '✅ SUCCESS' : '❌ FAILED');
    console.log('Admin Details:');
    console.log('  Email:', testAdmin.email);
    console.log('  Name:', testAdmin.name);
    console.log('  Role:', testAdmin.role);
    console.log('  Active:', testAdmin.active);
    console.log('  TenantId:', testAdmin.tenantId);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAdminPassword();
