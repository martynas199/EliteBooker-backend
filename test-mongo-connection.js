import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI.replace(/^["']|["']$/g, '').trim();

console.log('Testing MongoDB connection...');
console.log('URI (redacted):', MONGO_URI.replace(/:[^:@]+@/, ':****@'));

const mongoOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
};

mongoose.connect(MONGO_URI, mongoOptions)
  .then(() => {
    console.log('✓ MongoDB connection successful!');
    console.log('Database:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ MongoDB connection failed!');
    console.error('Error:', error.message);
    console.error('Error code:', error.code);
    console.error('\nTroubleshooting steps:');
    console.error('1. Check MongoDB Atlas Network Access - allow 0.0.0.0/0');
    console.error('2. Verify database user credentials');
    console.error('3. Ensure database user has readWrite permissions');
    console.error('4. Check if special characters in password need URL encoding');
    process.exit(1);
  });
