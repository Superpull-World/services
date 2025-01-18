# SuperPull Services

## Description

**SuperPull Services** is a Node.js backend service that powers the SuperPull NFT marketplace. It uses [Temporal](https://temporal.io/) for workflow orchestration and integrates with Solana blockchain through Anchor for NFT operations. The service provides RESTful APIs for the SuperPull mobile app and manages blockchain interactions.

## Features

- **NFT Creation Workflow**: Handles the complete NFT creation process including metadata upload and minting
- **Compressed NFTs**: Support for Metaplex Bubblegum compressed NFTs
- **Dynamic Bonding Curves**: Implements customizable bonding curves for NFT pricing
- **Anchor Program Integration**: Direct interaction with on-chain Anchor program for auctions
- **Workflow Orchestration**: Uses Temporal for reliable and scalable workflow execution

## Prerequisites

- **Node.js** (version 18.7.0 or higher)
- **NPM** (comes with Node.js)
- **Temporal Server** (local or remote instance)
- **Solana CLI Tools** (for blockchain interactions)
- **Docker** (optional, for containerized deployment)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd superpull-services
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

Required environment variables:
```env
# Solana Configuration
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=<your-private-key>
SUPERPULL_PROGRAM_ID=<anchor-program-id>
MERKLE_TREE=<compressed-nft-tree>
COLLECTION_MINT=<collection-nft-mint>

# Other configurations...
```

## Core Components

### Solana Service
- NFT creation with bonding curves
- Compressed NFT minting via Metaplex Bubblegum
- Token account management
- Integration with Anchor program

### Anchor Client
- Auction initialization and management
- Bid placement and tracking
- Price updates and state management
- Direct interaction with on-chain program


## Available Operations

### NFT Operations
- Create NFT with bonding curve
- Initialize auction
- Place bids
- Get current price
- Fetch auction state

### Workflow Operations

#### Start Workflow
- **POST** `/workflow/start`
- Starts a new workflow instance
- **Request Body**:
  ```json
  {
    "name": "createItemWorkflow",
    "args": [{
      "name": "string",
      "description": "string",
      "imageUrl": "string",
      "price": number,
      "ownerAddress": "string"
    }]
  }
  ```
- **Response**:
  ```json
  {
    "message": "Workflow createItemWorkflow started",
    "id": "workflow-instance-id"
  }
  ```

#### Get Workflow Status
- **GET** `/workflow/status?id={workflowId}`
- Retrieves the status of a workflow
- **Response**:
  ```json
  {
    "status": "RUNNING|COMPLETED|FAILED",
    "result": {}
  }
  ```

## Available Workflows

### Create Auction Workflow
- **Name**: `createAuction`
- **Purpose**: Creates a new NFT auction
- **Activities**:
  1. Verify JWT credentials
  2. Upload metadata
  3. Create Merkle tree
  4. Initialize auction
  5. Set up bonding curve

### Place Bid Workflow
- **Name**: `placeBid`
- **Purpose**: Places a bid on an auction
- **Activities**:
  1. Verify bid amount
  2. Create transaction
  3. Get user signature
  4. Submit to blockchain
  5. Monitor transaction status

### Authentication Workflow
- **Name**: `auth`
- **Purpose**: Authenticates users with wallet signatures
- **Activities**:
  1. Generate nonce
  2. Verify signature
  3. Generate JWT token

### Token Management Workflows
- **Name**: `getAcceptedTokenMints`
- **Purpose**: Retrieves list of accepted tokens
- **Activities**:
  1. Fetch token list
  2. Get metadata
  3. Cache results

### Auction List Workflow
- **Name**: `getAuctions`
- **Purpose**: Retrieves list of auctions with pagination
- **Activities**:
  1. Query auctions
  2. Fetch token metadata
  3. Return paginated results

## Development

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Configuration

### Environment Variables
```env
# Server Configuration
PORT=5001
NODE_ENV=development

# Temporal Configuration
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default

# Solana Configuration
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=<your-private-key>
COLLECTION_MINT=<collection-nft-mint>

# Security
JWT_SECRET=<your-jwt-secret>
ALLOWED_AUCTION_CREATORS=<comma-separated-addresses>

# Storage Configuration
IPFS_GATEWAY=https://ipfs.io
```

## Running the Application

### Development Setup

1. **Install Temporal CLI** (if not already installed)
   ```bash
   # On macOS
   brew install temporal

   # On other platforms, visit: https://learn.temporal.io/getting_started/typescript/dev_environment/
   ```

2. **Start Temporal Development Server**
   ```bash
   # Start in a separate terminal and keep it running
   temporal server start-dev
   ```
   The Temporal Web UI will be available at `http://localhost:8233`

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the Services**
   ```bash
   # Start all services using Docker Compose
   docker-compose up -d
   ```

This will start:
- API service (available at `http://localhost:5001`)
- Auth worker (handles authentication workflows)
- Auction worker (handles auction and bidding workflows)

All services will automatically connect to your local Temporal server.

### Development Mode (without Docker)
```bash
npm run dev
```

### Production Mode (without Docker)
```bash
npm run build
npm start
```

## Monitoring and Logging

- Temporal Web UI: Available at `http://localhost:8233` when running locally
- Application logs: Uses Winston for structured logging
- Metrics: Prometheus-compatible metrics exposed at `/metrics`

## Security

- All endpoints require authentication (except health check)
- Sensitive operations are protected by workflow permissions
- Wallet operations use secure key management
- Rate limiting implemented on all endpoints

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For support, please open an issue in the repository or contact the development team.