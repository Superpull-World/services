FROM node:18.7.0 AS builder

WORKDIR /app

# Copy package files first to leverage layer caching
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Production stage
FROM node:18.7.0-slim

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# The CMD will be specified in docker-compose.yml for different services
EXPOSE 5000
