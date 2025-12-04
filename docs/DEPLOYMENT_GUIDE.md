# Multi-Tenant SaaS Deployment Guide

Complete guide for deploying your multi-tenant beauty booking platform to production.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Migration](#database-migration)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [DNS & Domain Configuration](#dns--domain-configuration)
7. [SSL Certificates](#ssl-certificates)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup Strategy](#backup-strategy)
10. [Scaling Considerations](#scaling-considerations)

---

## Pre-Deployment Checklist

### Code Review

- [ ] All environment variables configured
- [ ] API keys are production keys (not test)
- [ ] Error handling implemented
- [ ] Security middleware enabled (helmet, rate limiting)
- [ ] CORS configured for production domains
- [ ] Sensitive data not logged
- [ ] Database indexes created

### Testing

- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Manual testing completed
- [ ] Cross-tenant isolation verified
- [ ] Payment flow tested with real cards

### Dependencies

- [ ] Production dependencies only
- [ ] No vulnerabilities (`npm audit`)
- [ ] Latest security patches applied
- [ ] Compatible Node.js version (18+)

---

## Environment Setup

### Backend Environment Variables

Create `.env.production` file:

```bash
# Server
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://yourdomain.com

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/production-db?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email (NodeMailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password
EMAIL_FROM=noreply@yourdomain.com

# OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback

APPLE_CLIENT_ID=your-apple-client-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key

# Default Tenant (for migration)
DEFAULT_TENANT_NAME=Default Salon
DEFAULT_TENANT_EMAIL=admin@yourdomain.com
DEFAULT_TENANT_SLUG=default-salon

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Frontend Environment Variables

Create `.env.production`:

```bash
VITE_API_URL=https://api.yourdomain.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_GOOGLE_MAPS_API_KEY=your-maps-api-key
```

---

## Database Migration

### Step 1: Backup Current Database

```bash
# Create backup
mongodump --uri="mongodb+srv://..." --out=./backup-$(date +%Y%m%d)

# Compress backup
tar -czf backup-$(date +%Y%m%d).tar.gz backup-$(date +%Y%m%d)/
```

### Step 2: Run Migration Script

```bash
cd booking-backend

# Set production environment variables
export NODE_ENV=production
export MONGO_URI=mongodb+srv://...

# Run migration
node scripts/migrate-to-multitenant.js
```

Expected Output:

```
[MIGRATION] Starting multi-tenant migration...
[MIGRATION] Created default tenant: default-salon
[MIGRATION] Migrated 15 admins
[MIGRATION] Migrated 245 appointments
[MIGRATION] Migrated 12 services
[MIGRATION] Migrated 8 beauticians
[MIGRATION] Migrated 1 settings
[MIGRATION] Migration completed successfully!
```

### Step 3: Verify Migration

```bash
# Connect to MongoDB
mongo "mongodb+srv://..."

# Check tenant exists
db.tenants.find({}).pretty()

# Check data has tenantId
db.appointments.findOne()
db.services.findOne()
db.beauticians.findOne()
```

---

## Backend Deployment

### Option 1: Render.com (Recommended)

#### 1. Create New Web Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `beauty-booking-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: `booking-backend`

#### 2. Set Environment Variables

Add all variables from `.env.production` in Render dashboard

#### 3. Configure Health Check

Add to `render.yaml`:

```yaml
services:
  - type: web
    name: beauty-booking-backend
    env: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 4000
```

#### 4. Deploy

```bash
git push origin main
# Render auto-deploys on push
```

### Option 2: AWS EC2

#### 1. Launch EC2 Instance

```bash
# Ubuntu 22.04 LTS
# t3.medium (2 vCPU, 4GB RAM) recommended
```

#### 2. Install Dependencies

```bash
# SSH into instance
ssh ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

#### 3. Deploy Application

```bash
# Clone repository
git clone https://github.com/yourusername/your-repo.git
cd your-repo/booking-backend

# Install dependencies
npm install --production

# Copy environment file
nano .env
# Paste production environment variables

# Start with PM2
pm2 start src/server.js --name beauty-booking-backend
pm2 save
pm2 startup

# Configure nginx reverse proxy
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/api.yourdomain.com
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/api.yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Option 3: Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create beauty-booking-backend

# Add MongoDB addon
heroku addons:create mongolab:sandbox

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
# ... (set all other env vars)

# Deploy
git subtree push --prefix booking-backend heroku main
```

---

## Frontend Deployment

### Option 1: Vercel (Recommended)

#### 1. Install Vercel CLI

```bash
npm install -g vercel
```

#### 2. Deploy

```bash
cd booking-frontend

# Login
vercel login

# Deploy
vercel --prod
```

#### 3. Configure Environment Variables

In Vercel dashboard, add:

- `VITE_API_URL`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

#### 4. Configure Rewrites

Create `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/salon/:slug/(.*)",
      "destination": "/index.html"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

### Option 2: Netlify

```bash
# Build
npm run build

# Deploy
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist
```

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Option 3: AWS S3 + CloudFront

```bash
# Build
npm run build

# Install AWS CLI
pip install awscli

# Configure
aws configure

# Create S3 bucket
aws s3 mb s3://yourdomain.com

# Enable static website hosting
aws s3 website s3://yourdomain.com --index-document index.html

# Upload files
aws s3 sync dist/ s3://yourdomain.com --delete

# Create CloudFront distribution
# (Use AWS Console for this step)
```

---

## DNS & Domain Configuration

### Main Domain (www.yourdomain.com)

**Vercel/Netlify:**

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**CloudFront:**

```
Type: A (Alias)
Name: www
Value: CloudFront distribution
```

### API Subdomain (api.yourdomain.com)

**Render:**

```
Type: CNAME
Name: api
Value: your-app.onrender.com
```

**AWS:**

```
Type: A
Name: api
Value: EC2 Elastic IP
```

### Tenant Subdomains (\*.yourdomain.com)

```
Type: CNAME
Name: *
Value: cname.vercel-dns.com
```

This allows:

- `salon-one.yourdomain.com`
- `salon-two.yourdomain.com`
- etc.

---

## SSL Certificates

### Automatic (Vercel/Netlify/Render)

SSL certificates are automatically provisioned and renewed.

### Manual (Let's Encrypt on EC2)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal (cron)
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet
```

---

## Monitoring & Logging

### Backend Monitoring

#### PM2 Monitoring

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# View logs
pm2 logs beauty-booking-backend
pm2 monit
```

#### Application Monitoring

Add to `src/server.js`:

```javascript
// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Error tracking (use Sentry)
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Database Monitoring

```bash
# MongoDB Atlas: Enable monitoring in dashboard
# Set up alerts for:
# - High CPU usage (> 80%)
# - High memory usage (> 80%)
# - Slow queries (> 100ms)
# - Connection spikes
```

### Uptime Monitoring

Use services like:

- **UptimeRobot** (free): https://uptimerobot.com
- **Pingdom**: https://pingdom.com
- **Datadog**: https://datadoghq.com

Configure checks for:

- `https://api.yourdomain.com/health` (every 5 min)
- `https://www.yourdomain.com` (every 5 min)

---

## Backup Strategy

### Database Backups

#### Automated (MongoDB Atlas)

1. Enable continuous backups in Atlas dashboard
2. Set retention period: 7 days
3. Schedule daily snapshots

#### Manual Backups

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
MONGO_URI="mongodb+srv://..."

# Create backup
mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR/$DATE"

# Compress
tar -czf "$BACKUP_DIR/$DATE.tar.gz" "$BACKUP_DIR/$DATE"
rm -rf "$BACKUP_DIR/$DATE"

# Upload to S3
aws s3 cp "$BACKUP_DIR/$DATE.tar.gz" s3://your-backup-bucket/mongodb/

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

Schedule with cron:

```bash
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

### File Backups (Uploads)

If using local storage, backup `uploads/` directory:

```bash
# Sync to S3
aws s3 sync /path/to/uploads s3://your-backup-bucket/uploads
```

---

## Scaling Considerations

### Horizontal Scaling

#### Load Balancer Setup

```nginx
upstream backend {
    least_conn;
    server backend1.yourdomain.com:4000;
    server backend2.yourdomain.com:4000;
    server backend3.yourdomain.com:4000;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://backend;
    }
}
```

#### Session Management

Use Redis for shared sessions:

```javascript
import Redis from "ioredis";
import session from "express-session";
import connectRedis from "connect-redis";

const RedisStore = connectRedis(session);
const redisClient = new Redis(process.env.REDIS_URL);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
```

### Database Scaling

#### MongoDB Atlas Auto-Scaling

1. Enable auto-scaling in Atlas dashboard
2. Set min/max cluster size
3. Configure scaling triggers

#### Read Replicas

```javascript
// Connection with read preference
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI, {
  readPreference: "secondaryPreferred",
});
```

### Caching Strategy

#### Redis Caching

```javascript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Cache tenant data
const getTenant = async (tenantId) => {
  const cached = await redis.get(`tenant:${tenantId}`);
  if (cached) return JSON.parse(cached);

  const tenant = await Tenant.findById(tenantId);
  await redis.setex(`tenant:${tenantId}`, 3600, JSON.stringify(tenant));

  return tenant;
};
```

---

## Post-Deployment Tasks

### 1. Verify Deployment

```bash
# Check backend health
curl https://api.yourdomain.com/health

# Check frontend
curl https://www.yourdomain.com

# Test tenant signup
# Test admin login
# Test payment flow
```

### 2. Configure Monitoring Alerts

Set up alerts for:

- Server downtime
- High error rates (> 5%)
- Slow response times (> 2s)
- Database connection errors
- Payment failures

### 3. Update Documentation

- [ ] Update README with production URLs
- [ ] Document deployment process
- [ ] Create runbook for common issues
- [ ] Update API documentation

### 4. Security Audit

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Review security headers
curl -I https://api.yourdomain.com
```

---

## Rollback Procedure

If deployment fails:

### 1. Rollback Code

```bash
# Vercel
vercel rollback

# Render
# Use dashboard to rollback to previous deployment

# PM2
pm2 stop beauty-booking-backend
git checkout previous-working-commit
npm install
pm2 restart beauty-booking-backend
```

### 2. Restore Database

```bash
# Restore from backup
mongorestore --uri="$MONGO_URI" --drop backup-directory/
```

### 3. Verify Rollback

- Test critical flows
- Check error rates
- Monitor logs

---

## Support & Maintenance

### Regular Tasks

**Daily:**

- Monitor error logs
- Check uptime status
- Review payment transactions

**Weekly:**

- Review performance metrics
- Check database growth
- Update dependencies

**Monthly:**

- Security audit
- Backup verification
- Cost optimization review

### Emergency Contacts

- **Hosting Support**: Render/Vercel/AWS support
- **Database**: MongoDB Atlas support
- **Payments**: Stripe support
- **Developer On-Call**: your-phone-number

---

## Additional Resources

- [MongoDB Production Checklist](https://docs.mongodb.com/manual/administration/production-checklist/)
- [Node.js Production Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Stripe Production Checklist](https://stripe.com/docs/security/guide#validating-webhooks)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)
