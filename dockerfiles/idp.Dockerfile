# IDP (Identity Provider) 服务 Dockerfile
# 用于构建和运行 OIDC 身份提供者服务

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖
RUN npm ci && npm cache clean --force

# 复制源代码
COPY . .

# IDP 不需要 build 步骤，使用 tsx 直接运行

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 安装所有依赖（overrides 配置会自动应用）
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# 复制必要的文件
COPY --from=builder /app/idp ./idp
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./

# 暴露 IDP 端口
EXPOSE 9000

# 设置生产环境
ENV NODE_ENV=production
ENV IDP_PORT=9000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9000/.well-known/openid-configuration', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动 IDP 服务
CMD ["npm", "run", "start:idp"]
