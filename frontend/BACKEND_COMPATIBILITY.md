# Frontend-Backend Compatibility Guide

This document explains how the frontend has been configured to work seamlessly with the backend API.

## Summary of Changes

All changes were made **only in the frontend** to ensure compatibility with the existing backend implementation.

## Files Modified

### 1. `/frontend/types/auth.ts`

**Changes:**

- Modified `SignupRequest` interface to match backend expectations:
  - Removed `fullName` as a direct property
  - Backend expects fullName to be passed in `metadata.full_name`
- Added new `SignupResponse` interface:

  - Backend returns tokens in a nested `session` object for signup
  - Different from login which returns tokens at the top level

- Updated `AuthContextType`:
  - Changed signup function signature to accept `metadata` instead of `fullName`

**Backend Compatibility:**

```typescript
// ✅ Signup - tokens in session object
{
  success: true,
  message: "User created successfully",
  user: {...},
  session: {
    access_token: "...",
    refresh_token: "..."
  }
}

// ✅ Login - tokens at top level
{
  success: true,
  message: "Login successful",
  user: {...},
  access_token: "...",
  refresh_token: "..."
}
```

### 2. `/frontend/lib/api-config.ts`

**Changes:**

- Updated default port from `3001` to `3000` (backend default)
- Added comprehensive payment endpoints:

  - `deposit` - Get deposit instructions
  - `depositCredit` - Credit after deposit verification
  - `depositManual` - Manual credit (testing/admin)
  - `history` - Payment transaction history
  - `status` - Check payment status
  - `transaction` - Get blockchain transaction details
  - `estimateGas` - Estimate gas costs

- Added pricing endpoints:
  - `pricing.endpoint(endpointId)` - Get/set endpoint pricing

**All endpoints now match backend routes exactly.**

## New Files Created

### 3. `/frontend/lib/auth-helpers.ts`

**Purpose:** Helper functions to handle backend-specific response formats

**Functions:**

- `normalizeAuthResponse()` - Converts signup response format to match login format
- `createSignupRequest()` - Properly formats signup requests with fullName in metadata
- `getAuthHeader()` - Creates Bearer token authorization headers

**Usage Example:**

```typescript
import { createSignupRequest, normalizeAuthResponse } from "@/lib/auth-helpers";

// Creating a signup request
const signupData = createSignupRequest(
  "user@example.com",
  "password123",
  "John Doe" // This will be placed in metadata.full_name
);

// Making the API call
const response = await fetch(API_ENDPOINTS.auth.signup, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(signupData),
});

const data = await response.json();

// Normalizing the response (converts session object to flat structure)
const normalizedAuth = normalizeAuthResponse(data);
// Now normalizedAuth.access_token and normalizedAuth.refresh_token are available
```

### 4. `/frontend/types/payment.ts`

**Purpose:** Complete type definitions for payment system

**Types Included:**

- `Balance` - User balance information
- `BalanceResponse` - Get balance response
- `DepositInstructionsResponse` - Deposit instructions
- `CreditDepositRequest` - Credit after deposit
- `ManualCreditRequest` - Manual credit
- `PricingConfig` - Endpoint pricing configuration
- `SetPricingRequest` - Set pricing request
- `PricingResponse` - Pricing response
- `PaymentTransaction` - Transaction record
- `PaymentHistoryResponse` - Transaction history
- `PaymentStatusResponse` - Payment status
- `TransactionDetailsResponse` - Blockchain transaction details
- `EstimateGasRequest` - Gas estimation request
- `EstimateGasResponse` - Gas estimation response

## Backend API Routes

All routes have been verified to match the backend implementation:

### Authentication Routes (`/api/auth/*`)

- ✅ `POST /api/auth/signup` - User registration
- ✅ `POST /api/auth/login` - User login
- ✅ `POST /api/auth/logout` - User logout (requires auth)
- ✅ `GET /api/auth/profile` - Get user profile (requires auth)
- ✅ `POST /api/auth/refresh` - Refresh access token

### Endpoint Management Routes (`/api/endpoints/*`)

- ✅ `GET /api/endpoints` - List endpoints (requires auth)
- ✅ `POST /api/endpoints` - Create endpoint (requires auth)
- ✅ `GET /api/endpoints/:id` - Get endpoint details
- ✅ `PUT /api/endpoints/:id` - Update endpoint (requires auth)
- ✅ `DELETE /api/endpoints/:name` - Delete endpoint (requires auth)

### Payment Routes (`/api/*`)

- ✅ `GET /api/balance` - Get user balance (requires auth)
- ✅ `GET /api/deposit` - Get deposit instructions (requires auth)
- ✅ `POST /api/deposit/credit` - Credit after deposit (requires auth)
- ✅ `POST /api/deposit/manual` - Manual credit (requires auth)
- ✅ `GET /api/payments/history` - Payment history (requires auth)
- ✅ `GET /api/payments/status/:paymentId` - Payment status (requires auth)
- ✅ `GET /api/payments/transaction/:tx_hash` - Transaction details (requires auth)
- ✅ `POST /api/payments/estimate-gas` - Estimate gas (requires auth)

### Pricing Routes (`/api/pricing/*`)

- ✅ `POST /api/pricing/endpoint/:endpointId` - Set pricing (requires auth, developer only)
- ✅ `GET /api/pricing/endpoint/:endpointId` - Get pricing (public)
- ✅ `DELETE /api/pricing/endpoint/:endpointId` - Remove pricing (requires auth, developer only)

### Health Check

- ✅ `GET /health` - Server health check

## Environment Variables

Make sure to set the correct API URL in your `.env.local`:

```bash
# For local development (backend runs on port 3000)
NEXT_PUBLIC_API_URL=http://localhost:3000

# For production
NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

If not set, the frontend defaults to `http://localhost:3000`.

## Authentication Flow

### Signup Flow

```typescript
// 1. Create signup request with fullName
const signupData = createSignupRequest(email, password, fullName);

// 2. Send to backend
const response = await fetch(API_ENDPOINTS.auth.signup, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(signupData),
});

// 3. Parse response
const data: SignupResponse = await response.json();

// 4. Normalize response to get tokens
const auth = normalizeAuthResponse(data);
const { access_token, refresh_token, user } = auth;

// 5. Store tokens
localStorage.setItem("accessToken", access_token);
localStorage.setItem("refreshToken", refresh_token);
```

### Login Flow

```typescript
// 1. Send login request
const response = await fetch(API_ENDPOINTS.auth.login, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

// 2. Parse response (already in correct format)
const data: AuthResponse = await response.json();
const { access_token, refresh_token, user } = data;

// 3. Store tokens
localStorage.setItem("accessToken", access_token);
localStorage.setItem("refreshToken", refresh_token);
```

### Making Authenticated Requests

```typescript
import { getAuthHeader } from "@/lib/auth-helpers";

const token = localStorage.getItem("accessToken");

const response = await fetch(API_ENDPOINTS.payment.balance, {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
    ...getAuthHeader(token),
  },
});
```

## Key Differences from Backend

1. **Signup Response Format**

   - Backend returns `{ session: { access_token, refresh_token } }`
   - Use `normalizeAuthResponse()` to convert to flat format

2. **Full Name Handling**

   - Backend doesn't accept `fullName` directly
   - Must be sent as `metadata.full_name`
   - Use `createSignupRequest()` helper for proper formatting

3. **Token Storage**
   - Backend returns tokens in response
   - Frontend must handle storage (localStorage, cookies, etc.)

## Testing Checklist

- [ ] Signup with fullName works correctly
- [ ] Login returns tokens correctly
- [ ] Profile endpoint returns user data with full_name
- [ ] Protected routes require authentication
- [ ] Token refresh works correctly
- [ ] Payment endpoints are accessible
- [ ] Balance check works
- [ ] Deposit instructions can be retrieved
- [ ] Payment history is displayed correctly

## Troubleshooting

### Issue: "Cannot connect to backend"

**Solution:** Check that backend is running on port 3000 or set `NEXT_PUBLIC_API_URL` correctly.

### Issue: "fullName not saved on signup"

**Solution:** Ensure you're using `createSignupRequest()` helper which puts fullName in metadata.

### Issue: "Tokens not found after signup"

**Solution:** Use `normalizeAuthResponse()` to extract tokens from the session object.

### Issue: "401 Unauthorized on protected routes"

**Solution:** Ensure you're sending the Authorization header with Bearer token using `getAuthHeader()`.

## Notes

- Backend is stateless and uses JWT tokens for authentication
- All protected routes require `Authorization: Bearer <token>` header
- Tokens expire and should be refreshed using the `/api/auth/refresh` endpoint
- Payment system uses internal accounting (balance tracking)
- Full blockchain integration is available for deposits and transactions
