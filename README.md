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

### Create Item Workflow
- **Name**: `createItemWorkflow`
- **Purpose**: Creates a new NFT listing
- **Activities**:
  1. Validate input data
  2. Upload metadata to IPFS
  3. Mint NFT on Solana
  4. Initialize bonding curve
  5. Create marketplace listing

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
PORT=3000
NODE_ENV=development

# Temporal Configuration
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default

# Solana Configuration
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Storage Configuration
IPFS_GATEWAY=https://ipfs.io
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Docker Deployment
```bash
docker build -t superpull-services .
docker run -p 3000:3000 superpull-services
```

## Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration
```

## Monitoring and Logging

- Temporal Web UI: Available at `http://localhost:8080` when running locally
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