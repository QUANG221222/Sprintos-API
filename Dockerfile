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

# Build NestJS
RUN npm run build

CMD [ "npm", "run", "start:dev" ]

# ============ Stage 2: Production ============
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init để handle signals đúng cách
RUN apk add --no-cache dumb-init

# Tạo user non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Chỉ install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client (production)
RUN npx prisma generate

# Copy build output từ stage 1
COPY --from=builder /app/dist ./dist

# Đổi ownership
RUN chown -R nestjs:nodejs /app

# Switch sang user non-root
USER nestjs

EXPOSE 8080

# Dùng dumb-init để handle SIGTERM đúng
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]