# MCP Marketplace

A decentralized marketplace for Model Context Protocol (MCP) servers built on the Sui blockchain. This platform enables developers to create, publish, and monetize MCP endpoints while providing users with a seamless way to discover and connect AI tools through Claude Desktop or ChatGPT.

## Overview

The MCP Marketplace combines the power of Sui blockchain smart contracts, Walrus decentralized storage, and the Model Context Protocol to create a truly decentralized marketplace for AI tools. Developers can publish their APIs as MCP endpoints, set their own pricing, and receive payments directly in SUI tokens. Users can browse the marketplace, connect to developer endpoints via OAuth, and pay for API usage through on-chain transactions.

## Features

**For Developers:**

- Create and publish MCP endpoints with custom pricing
- Store endpoint configurations permanently on Walrus decentralized storage
- Receive payments directly in SUI tokens to your wallet
- Track endpoint usage and earnings on-chain
- OAuth 2.1 protected endpoints for secure access

**For Users:**

- Browse marketplace of available MCP endpoints
- Connect to endpoints via Claude Desktop or ChatGPT
- Secure OAuth authentication for accessing tools
- Non-custodial payments - funds go directly to developers
- On-chain balance tracking and payment history

**Technical Highlights:**

- Dynamic MCP servers that load endpoints on-demand
- Sui Move smart contracts for endpoint registry and payments
- Walrus storage for immutable endpoint configurations
- OAuth 2.1 compliant authentication
- Type-safe TypeScript backend with Express
- Modern Next.js frontend with Tailwind CSS

## Architecture

The project consists of three main components:

### Backend (`backend/`)

Express.js server that provides:

- REST API for endpoint management
- OAuth 2.1 authentication endpoints
- Dynamic MCP server registry (one per user)
- Wallet connection and management
- Payment transaction building
- Integration with Sui blockchain and Walrus storage

### Frontend (`frontend/`)

Next.js application with:

- User authentication and dashboard
- Marketplace browser
- Endpoint creation and management interface
- Wallet connection using Sui wallet adapters
- OAuth client management

### Smart Contracts (`contracts/`)

Sui Move modules that handle:

- **endpoint_registry**: Endpoint creation, ownership, and lifecycle management
- **payment_system**: Payment processing and balance tracking
- **access_control**: Ownership capabilities and permissions

## Prerequisites

- Node.js 18+ and npm
- Sui CLI for smart contract deployment
- A Sui wallet (Suiet, Sui Wallet, etc.)
- Supabase account (for user authentication and profile data)
- Walrus storage access (testnet available)

## Getting Started

### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install Sui CLI (if not already installed)
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui
```

### 2. Set Up Supabase

1. Create a new Supabase project
2. Run the schema migration:
   ```bash
   cd backend
   # Connect to your Supabase project and run:
   psql -h <your-db-host> -U postgres -d postgres -f supabase_schema.sql
   ```
3. Get your Supabase URL and anon key from project settings

### 4. Deploy Smart Contracts

```bash
cd contracts

# Build the contracts
sui move build

# Deploy to testnet (you'll need SUI for gas)
sui client publish --gas-budget 100000000

# Copy the Package ID from the output and add it to backend/.env
# Also generate a server keypair for the backend:
sui keytool generate ed25519
# Copy the private key to SERVER_PRIVATE_KEY in backend/.env
```

### 5. Start the Development Servers

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

The backend will be available at `http://localhost:3000` and the frontend at `http://localhost:3001`.

## Usage Guide

### For Developers

1. **Sign Up**: Create an account on the frontend
2. **Connect Wallet**: Connect your Sui wallet to receive payments
3. **Create OAuth Client**: Generate OAuth credentials in the Wallet page
4. **Create Endpoint**:
   - Go to the Endpoints page
   - Click "Create Endpoint"
   - Fill in endpoint details (name, URL, method, description)
   - Set pricing (in SUI per call)
   - The endpoint config will be stored on Walrus and registered on-chain
5. **Share Your MCP URL**: Share your personalized MCP server URL (`/mcp/{your-user-id}`) with users

### For Users

1. **Browse Marketplace**: View all available developers and their endpoints
2. **Get MCP URL**: Copy a developer's MCP server URL from the marketplace
3. **Create OAuth Credentials**: Generate OAuth credentials in your Wallet page
4. **Connect to Claude Desktop**:
   - Open Claude Desktop settings
   - Add new MCP server with the developer's URL
   - Enter your OAuth client ID and secret
   - Restart Claude Desktop
5. **Use Tools**: Once connected, you can use the developer's endpoints as tools in Claude conversations
6. **Make Payments**: When a paid endpoint is used, you'll receive a payment transaction to sign. Payments go directly to the developer's wallet.

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get user profile (authenticated)
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh access token

### Endpoint Management

- `POST /api/endpoints` - Create endpoint (authenticated)
- `GET /api/endpoints` - List your endpoints (authenticated)
- `GET /api/endpoints/marketplace` - Browse all endpoints (authenticated)
- `PUT /api/endpoints/:id` - Update endpoint (authenticated)
- `DELETE /api/endpoints/:name` - Delete endpoint (authenticated)

### Wallet & Payments

- `POST /api/wallet/connect` - Connect Sui wallet (authenticated)
- `GET /api/wallet` - Get wallet info (authenticated)
- `GET /api/balance` - Get on-chain balance (authenticated)
- `POST /api/deposit/credit` - Add test credits (development only)
- `GET /api/payments/history` - Get payment history (authenticated)

### MCP

- `GET /api/mcp/connection` - Get your MCP connection info (authenticated)
- `ALL /mcp/:userId` - Connect to user's MCP server (OAuth protected)
- `ALL /mcp/u/:username` - Connect by username (OAuth protected)

### OAuth 2.1

- `GET /.well-known/oauth-protected-resource` - OAuth metadata
- `GET /api/auth/oauth/authorize` - Authorization endpoint
- `POST /api/auth/oauth/token` - Token endpoint
- `GET /api/auth/oauth/clients` - List OAuth clients (authenticated)

## Project Structure

```
├── backend/              # Express.js backend
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── routes/       # API route definitions
│   │   ├── services/     # Business logic
│   │   ├── mcp/          # MCP server implementation
│   │   ├── middleware/   # Auth middleware
│   │   └── server.ts     # Main server file
│   └── package.json
├── frontend/             # Next.js frontend
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── services/         # API client services
│   └── package.json
└── contracts/            # Sui Move smart contracts
    ├── sources/          # Move source files
    └── Move.toml
```

## Technology Stack

**Backend:**

- Express.js - Web framework
- TypeScript - Type safety
- Supabase - User authentication and profiles
- Sui SDK - Blockchain interaction
- Walrus - Decentralized storage
- MCP SDK - Model Context Protocol

**Frontend:**

- Next.js 16 - React framework
- TypeScript - Type safety
- Tailwind CSS - Styling
- Radix UI - Component library
- Suiet Wallet Kit - Wallet connection

**Blockchain:**

- Sui - Smart contract platform
- Move - Smart contract language
- Walrus - Decentralized blob storage

## Development

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Building for Production

```bash
# Build backend
cd backend
npm run build
npm start

# Build frontend
cd frontend
npm run build
npm start
```

### Linting

```bash
# Backend
cd backend
npm run lint

# Frontend
cd frontend
npm run lint
```

## Security Considerations

- All payments are non-custodial - users sign transactions directly with their wallets
- OAuth 2.1 compliant authentication for secure endpoint access
- Endpoint configurations stored on immutable Walrus blobs
- Smart contracts enforce ownership and payment rules
- No sensitive credentials stored on-chain (only public API configurations)
