# ⚠️ 废弃警告：此 Dockerfile 已被拆分为多个独立文件
# 
# 新的 Dockerfile 位置：
# - dockerfiles/app.Dockerfile (主应用服务)
# - dockerfiles/idp.Dockerfile (IDP 认证服务)
#
# 此文件保留仅用于向后兼容，建议使用新的 Dockerfile。
# 详见：DOCKER_MIGRATION_GUIDE.md
#
# ============================================================

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
# 注意：敏感信息应通过环境变量传入，不要硬编码在 Dockerfile 中
# 请在运行容器时通过 -e 参数或 docker-compose.yml 传入以下环境变量：
# - OLLAMA_API_URL
# - OLLAMA_MODEL
# - MONGODB_URI
# - REDIS_PASSWORD
# - TAVILY_API_KEY
# - ARK_API_KEY
# - ARK_API_URL
# - ARK_MODEL

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "run", "serve"]

