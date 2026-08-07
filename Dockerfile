# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install system dependencies for native modules (e.g., canvas, sharp, tesseract)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Copy source and build TypeScript
COPY . .
RUN npm run build

# ── Stage 2: Runtime ──
FROM node:20-alpine

WORKDIR /app

# Create directories for uploads and reports
RUN mkdir -p uploads/incidents reports

# Copy built artifacts and production dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Expose port
EXPOSE 3000

# Health check — hits the /health endpoint every 30 s
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the app
CMD ["node", "dist/app.js"]
