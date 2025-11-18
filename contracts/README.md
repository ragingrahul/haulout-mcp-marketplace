# MCP Marketplace Smart Contracts

Sui Move smart contracts for the MCP Marketplace platform.

## Overview

This directory contains three Move modules:

1. **endpoint_registry** - Manages API endpoint ownership, pricing, and lifecycle
2. **payment_system** - Handles deposits, payments, and balance tracking
3. **access_control** - Manages ownership capabilities and permissions

## Prerequisites

- Sui CLI installed: `cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui`
- Sui wallet with testnet SUI for gas fees

## Setup

### 1. Create Sui Wallet

```bash
# Create a new keypair
sui keytool generate ed25519

# Get testnet SUI from faucet
sui client faucet
```

### 2. Build Contracts

```bash
cd backend/contracts
sui move build
```

### 3. Deploy to Testnet

```bash
# Publish the package
sui client publish --gas-budget 100000000

# Output will show:
# - Package ID: 0x...
# - Created objects
# - Transaction digest
```

### 4. Configure Environment

Copy the Package ID from the deployment output and add to `backend/.env`:

```env
SUI_PACKAGE_ID=0xYOUR_PACKAGE_ID_HERE
SERVER_PRIVATE_KEY=suiprivkey...YOUR_PRIVATE_KEY
```

## Contract Architecture

### Endpoint Registry

```move
public struct Endpoint has key, store {
    id: UID,
    owner: address,
    walrus_blob_id: vector<u8>,
    price_per_call: u64,
    total_calls: u64,
    active: bool,
    created_at: u64,
}
```

**Key Functions:**

- `create_endpoint` - Creates a new endpoint as a shared object
- `update_pricing` - Updates endpoint pricing (owner only)
- `update_walrus_blob` - Updates Walrus blob ID for endpoint updates
- `deactivate_endpoint` - Soft deletes an endpoint
- `increment_call_count` - Increments call counter after API invocation

### Payment System

```move
public struct UserBalance has key {
    id: UID,
    owner: address,
    total_deposited: u64,
    total_spent: u64,
    created_at: u64,
}
```

**Key Functions:**

- `create_balance` - Creates balance tracker for user
- `deposit_funds` - Records deposit (tracking only)
- `process_payment` - Transfers SUI from payer to endpoint owner
- `update_spending` - Updates spending tracker

### Access Control

```move
public struct EndpointOwnerCap has key, store {
    id: UID,
    endpoint_id: address,
    granted_at: u64,
}
```

**Key Functions:**

- `create_owner_cap` - Creates ownership capability
- `grant_access` - Grants access to an endpoint
- `revoke_access` - Revokes access
- `verify_owner` - Verifies ownership

## Usage Examples

### Create Endpoint

```typescript
const tx = new Transaction();
const blobIdBytes = Array.from(Buffer.from("blob_123", "utf-8"));

tx.moveCall({
  target: `${PACKAGE_ID}::endpoint_registry::create_endpoint`,
  arguments: [
    tx.pure.vector("u8", blobIdBytes),
    tx.pure.u64("1000000000"), // 1 SUI in MIST
    tx.object("0x6"), // Clock object
  ],
});

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
});
```

### Process Payment

```typescript
const tx = new Transaction();
const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64("1000000000")]);

tx.moveCall({
  target: `${PACKAGE_ID}::payment_system::process_payment`,
  arguments: [
    tx.object(endpointId),
    coin,
    tx.object("0x6"), // Clock object
  ],
});

const result = await client.signAndExecuteTransaction({
  signer: payerKeypair,
  transaction: tx,
});
```

## Testing

```bash
# Run Move tests
sui move test

# Run integration tests (requires deployed contracts)
cd ../src
npm run test:contracts
```

## Verification

After deployment, verify on Sui Explorer:

- Testnet: https://suiscan.xyz/testnet/object/{PACKAGE_ID}
- Mainnet: https://suiscan.xyz/mainnet/object/{PACKAGE_ID}

## Gas Costs

Typical gas costs on testnet:

- Deploy package: ~50-100M MIST (~0.05-0.1 SUI)
- Create endpoint: ~1-2M MIST (~0.001-0.002 SUI)
- Process payment: ~1M MIST (~0.001 SUI)
- Update pricing: ~1M MIST (~0.001 SUI)

## Security Considerations

1. **Ownership Checks**: All mutable operations verify ownership
2. **Shared Objects**: Endpoints are shared for marketplace visibility
3. **Immutable Data**: Walrus blobs are immutable (create new blob for updates)
4. **Event Emission**: All state changes emit events for transparency
5. **Gas Payment**: Server keypair pays gas for endpoint creation

## Troubleshooting

### Build Errors

```bash
# Clear build cache
rm -rf build/

# Rebuild
sui move build
```

### Deployment Errors

```bash
# Check wallet balance
sui client gas

# Request more testnet SUI
sui client faucet

# Check active address
sui client active-address
```

### Transaction Failures

Check transaction on Sui Explorer for detailed error messages:

```
https://suiscan.xyz/testnet/tx/{TRANSACTION_DIGEST}
```

## Upgrade Strategy

Sui packages are immutable by default. To upgrade:

1. Deploy new package version
2. Update `SUI_PACKAGE_ID` in environment
3. Migrate data if needed (endpoints remain on old package)

For production, consider using Sui's upgrade policy features.

## License

MIT
