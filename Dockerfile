# ============ Stage 1: Build ============
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDeps for build)
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build NestJS (tăng max-old-space-size lên 4GB tránh out of memory khi compile)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ============ Stage 2: Production ============
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init, libc6-compat và openssl cho Prisma
RUN apk add --no-cache dumb-init libc6-compat openssl

# Tạo user non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files and scripts
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY emails ./emails/
COPY initialScript ./initialScript/

# Chỉ install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client (production)
RUN npx prisma generate

# Copy build output từ stage 1
COPY --from=builder /app/dist ./dist

EXPOSE 8080

# Dùng dumb-init để handle SIGTERM đúng
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]