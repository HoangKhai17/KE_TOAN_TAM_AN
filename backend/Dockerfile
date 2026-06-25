FROM node:20-alpine AS base
WORKDIR /app
# postgresql16-client cung cấp pg_dump/pg_restore (khớp Postgres 16) cho chức năng backup
RUN apk add --no-cache curl python3 make g++ postgresql16-client

# Development stage
FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
