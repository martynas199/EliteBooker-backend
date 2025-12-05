import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Tenant from './src/models/Tenant.js';
import Admin from './src/models/Admin.js';
import Settings from './src/models/Settings.js';
import bcrypt from 'bcryptjs';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, '').trim();

async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log('✓ Connected to MongoDB');

    // Create Elite Booker tenant
    console.log('\nCreating Elite Booker tenant...');
    let tenant = await Tenant.findOne({ slug: 'elite-booker' });
    
    if (!tenant) {
      tenant = await Tenant.create({
        name: 'Elite Booker',
        businessName: 'Elite Booker',
        slug: 'elite-booker',
        email: 'info@elitebooker.co.uk',
        phone: '+44 20 1234 5678',
        address: {
          street: '123 High Street',
          city: 'London',
          postalCode: 'SW1A 1AA',
          country: 'United Kingdom',
        },
        active: true,
        branding: {
          primaryColor: '#d4a710',
          secondaryColor: '#1a1a1a',
          logoUrl: '',
        },
        seo: {
          metaTitle: 'Elite Booker - Professional Booking System',
          metaDescription: 'Book appointments with professional service providers',
          keywords: ['booking', 'appointments', 'salon', 'beauty', 'wellness'],
        },
      });
      console.log('✓ Tenant created:', tenant.slug);
    } else {
      console.log('✓ Tenant already exists:', tenant.slug);
    }

    // Create admin user
    console.log('\nCreating admin user...');
    let admin = await Admin.findOne({ email: 'admin@elitebooker.co.uk' });
    
    if (!admin) {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      admin = await Admin.create({
        name: 'Admin User',
        email: 'admin@elitebooker.co.uk',
        password: hashedPassword,
        role: 'super_admin',
        tenantId: tenant._id,
        active: true,
      });
      console.log('✓ Admin created:', admin.email);
      console.log('  Password: Admin123!');
    } else {
      console.log('✓ Admin already exists:', admin.email);
    }

    // Create settings
    console.log('\nCreating settings...');
    let settings = await Settings.findOne({ tenantId: tenant._id });
    
    if (!settings) {
      settings = await Settings.create({
        tenantId: tenant._id,
        salonName: 'Elite Booker',
        salonEmail: 'info@elitebooker.co.uk',
        salonPhone: '+44 20 1234 5678',
        salonAddress: '123 High Street, London, SW1A 1AA, United Kingdom',
        salonDescription: 'Professional booking system for service providers',
        workingHours: {
          mon: { start: '09:00', end: '17:00' },
          tue: { start: '09:00', end: '17:00' },
          wed: { start: '09:00', end: '17:00' },
          thu: { start: '09:00', end: '17:00' },
          fri: { start: '09:00', end: '17:00' },
          sat: { start: '09:00', end: '13:00' },
          sun: null,
        },
        currency: 'GBP',
        timezone: 'Europe/London',
      });
      console.log('✓ Settings created');
    } else {
      console.log('✓ Settings already exist');
    }

    // Create "namboo" tenant
    console.log('\nCreating Namboo tenant...');
    let nambooTenant = await Tenant.findOne({ slug: 'namboo' });
    
    if (!nambooTenant) {
      nambooTenant = await Tenant.create({
        name: 'Namboo Salon',
        businessName: 'Namboo Salon',
        slug: 'namboo',
        email: 'info@namboo.co.uk',
        phone: '+44 20 9876 5432',
        address: {
          street: '456 Beauty Lane',
          city: 'London',
          postalCode: 'E1 6AN',
          country: 'United Kingdom',
        },
        active: true,
        branding: {
          primaryColor: '#d4a710',
          secondaryColor: '#1a1a1a',
          logoUrl: '',
        },
        seo: {
          metaTitle: 'Namboo Salon - Beauty & Wellness',
          metaDescription: 'Premium beauty and wellness services',
          keywords: ['salon', 'beauty', 'wellness', 'spa'],
        },
      });
      console.log('✓ Namboo tenant created:', nambooTenant.slug);
      
      // Create admin for Namboo
      const nambooPassword = await bcrypt.hash('Namboo123!', 10);
      await Admin.create({
        name: 'Namboo Admin',
        email: 'admin@namboo.co.uk',
        password: nambooPassword,
        role: 'super_admin',
        tenantId: nambooTenant._id,
        active: true,
      });
      console.log('✓ Namboo admin created: admin@namboo.co.uk');
      console.log('  Password: Namboo123!');

      // Create settings for Namboo
      await Settings.create({
        tenantId: nambooTenant._id,
        salonName: 'Namboo Salon',
        salonEmail: 'info@namboo.co.uk',
        salonPhone: '+44 20 9876 5432',
        salonAddress: '456 Beauty Lane, London, E1 6AN, United Kingdom',
        salonDescription: 'Premium beauty and wellness services',
        workingHours: {
          mon: { start: '09:00', end: '18:00' },
          tue: { start: '09:00', end: '18:00' },
          wed: { start: '09:00', end: '18:00' },
          thu: { start: '09:00', end: '18:00' },
          fri: { start: '09:00', end: '18:00' },
          sat: { start: '09:00', end: '17:00' },
          sun: null,
        },
        currency: 'GBP',
        timezone: 'Europe/London',
      });
      console.log('✓ Namboo settings created');
    } else {
      console.log('✓ Namboo tenant already exists:', nambooTenant.slug);
    }

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\nYou can now:');
    console.log('1. Access Elite Booker at: http://localhost:5173/salon/elite-booker');
    console.log('   Admin login: admin@elitebooker.co.uk / Admin123!');
    console.log('\n2. Access Namboo at: http://localhost:5173/salon/namboo');
    console.log('   Admin login: admin@namboo.co.uk / Namboo123!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
