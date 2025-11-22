# Multi-stage build for Modern.js application

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/modern.config.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/api ./api
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/.env.production ./.env.production
COPY --from=builder /app/.env.production ./dist/.env.production

# Expose port
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production
# Set environment variables in Dockerfile to ensure they are available
ENV OLLAMA_API_URL=http://host.docker.internal:11434
ENV OLLAMA_MODEL=deepseek-r1:7b
ENV MONGODB_URI=mongodb://mongodb-global:27017/ai-agent

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "run", "serve"]

