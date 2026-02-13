# Backend Cleanup Audit (February 12, 2026)

## Scope scanned

- `src/server.js` bootstrap + middleware order
- `src/routes/*` API surface and consistency hotspots
- `src/services/*`, `src/controllers/*`, `src/middleware/*`
- Existing tests in `tests/unit`, `tests/integration`, `tests/e2e`

## Priority improvements identified

### P0 (implemented in this pass)

1. Split app composition from process bootstrap to improve testability.
2. Remove duplicate `/api/specialists` route mounting.
3. Add explicit legacy alias route for `/api/beauticians`.
4. Replace global `400` error fallback with status-aware error handling.
5. Add API `404` fallback handler.
6. Centralize CORS origin policy and make allowlist deduplicated.
7. Load `.env.{NODE_ENV}` on top of base `.env` (e.g. `.env.test`).

### P1 (recommended next)

1. Break down very large route files (`webhooks.js`, `orders.js`, `tenants.js`, `checkout.js`, `payments.js`) into controller + route modules.
2. Standardize logging (`console.*` vs structured logger) and remove verbose request payload logging in production paths.
3. Replace scattered inline validation responses with shared request validation/error helpers.
4. Add route-level unit tests for major public endpoints (services/specialists/checkout) with mocked dependencies.
5. Add linting + formatting gate in CI to prevent style/consistency drift.

### P2 (recommended after P1)

1. Extract repeated auth/tenant permission checks into reusable middleware.
2. Consolidate legacy naming (`beautician` vs `specialist`) in API contracts and schemas.
3. Add contract tests for error envelope consistency (`{ error }` + status code behavior).

