# Multi-Tenant Testing Suite

Comprehensive test coverage for the multi-tenant SaaS platform, including unit tests, integration tests, and end-to-end tests.

## Test Structure

```
tests/
├── unit/
│   └── multiTenant.test.js          # Mongoose plugin isolation tests
├── integration/
│   └── tenantIsolation.test.js      # API endpoint cross-tenant prevention
└── e2e/
    └── tenantSignup.test.js         # Complete flow from signup to payment
```

## Prerequisites

Install test dependencies:

```bash
npm install --save-dev @jest/globals jest mongodb-memory-server supertest
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

## Test Descriptions

### Unit Tests (`tests/unit/multiTenant.test.js`)

Tests the `multiTenantPlugin` Mongoose middleware for:

- **Query Filtering**: Ensures queries only return documents for the current tenant
- **Update Prevention**: Prevents updating documents from other tenants
- **Delete Prevention**: Prevents deleting documents from other tenants
- **FindById Isolation**: Prevents finding documents by ID from other tenants
- **Auto tenantId**: Automatically adds tenantId when creating documents
- **Immutable tenantId**: Prevents changing tenantId after creation
- **Count Operations**: Ensures countDocuments respects tenant context
- **Context Clearing**: Verifies tenant context can be cleared

**Expected Results**: 8 passing tests

### Integration Tests (`tests/integration/tenantIsolation.test.js`)

Tests API endpoints for cross-tenant access prevention:

- **GET /api/appointments**: Only returns appointments for authenticated tenant
- **GET /api/appointments/:id**: Returns 404 for other tenants' appointments
- **PUT /api/appointments/:id**: Prevents updating other tenants' appointments
- **DELETE /api/appointments/:id**: Prevents deleting other tenants' appointments
- **GET /api/services**: Only returns services for authenticated tenant
- **Header Resolution**: Tests X-Tenant-ID header-based tenant resolution
- **Mismatched Headers**: Verifies prevention of access with wrong tenant header

**Expected Results**: 8 passing tests

### E2E Tests (`tests/e2e/tenantSignup.test.js`)

Tests the complete multi-tenant workflow:

1. **Tenant Signup**: Creates new tenant via `/api/tenants/create`
2. **Admin Authentication**: Verifies admin JWT token and dashboard access
3. **Beautician Creation**: Creates specialist within tenant context
4. **Stripe Connect**: Initiates specialist Stripe Connect onboarding
5. **Service Creation**: Creates bookable service
6. **Slot Availability**: Checks available time slots
7. **Appointment Booking**: Creates customer appointment
8. **Platform Fee**: Verifies platform fee calculation
9. **Tenant Isolation**: Tests cross-tenant access prevention
10. **Settings Update**: Updates tenant scheduling and payment settings
11. **Branding**: Verifies branding customization
12. **Public Access**: Tests tenant lookup by slug

**Expected Results**: 13 passing tests

## Test Environment

- **Database**: MongoDB Memory Server (in-memory)
- **HTTP Testing**: Supertest
- **Framework**: Jest with ES Modules
- **Timeout**: 30 seconds per test

## Coverage Targets

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## Key Files Tested

### Backend Models

- `Tenant.js`
- `Admin.js`
- `Appointment.js`
- `Service.js`
- `Beautician.js`

### Backend Middleware

- `multiTenantPlugin.js`
- `resolveTenant.js`
- `requireAdmin.js`

### Backend Routes

- `/api/tenants/*`
- `/api/appointments/*`
- `/api/services/*`
- `/api/specialists/*`

## Common Issues & Solutions

### Issue: MongoDB Memory Server timeout

**Solution**: Increase test timeout in jest.config.json:

```json
{
  "testTimeout": 60000
}
```

### Issue: ES Module import errors

**Solution**: Ensure `"type": "module"` in package.json and use:

```bash
NODE_OPTIONS=--experimental-vm-modules jest
```

### Issue: Tests fail with "Tenant context not set"

**Solution**: Ensure `setTenantContext()` is called before queries in unit tests

### Issue: Integration tests return wrong status codes

**Solution**: Verify JWT tokens include correct `tenantId` in payload

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```

## Manual Testing Checklist

After running automated tests, manually verify:

- [ ] Tenant signup flow in browser
- [ ] Admin dashboard loads with correct tenant data
- [ ] Beautician Stripe Connect onboarding opens Stripe page
- [ ] Customer can book appointment
- [ ] Payment includes correct platform fee
- [ ] Cross-tenant navigation is blocked
- [ ] Branding changes apply in real-time

## Test Data

Tests create the following test data:

- **Tenants**: 2+ (My Beauty Salon, Another Salon)
- **Admins**: 2+ (one per tenant)
- **Beauticians**: 1+ per tenant
- **Services**: 1+ per tenant
- **Appointments**: 1+ per tenant

All test data is isolated in MongoDB Memory Server and deleted after tests complete.

## Debugging Tests

### Enable verbose output:

```bash
npm test -- --verbose
```

### Run single test file:

```bash
npm test -- tests/unit/multiTenant.test.js
```

### Debug specific test:

```bash
node --inspect-brk node_modules/.bin/jest tests/unit/multiTenant.test.js
```

## Next Steps

1. Install test dependencies: `npm install`
2. Run tests: `npm test`
3. Review coverage report: `open coverage/lcov-report/index.html`
4. Add tests for new features as needed
5. Integrate with CI/CD pipeline

## Support

For issues or questions about tests:

1. Check test output for specific error messages
2. Review this README for common solutions
3. Verify all dependencies are installed
4. Ensure MongoDB Memory Server has sufficient resources
