FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# The built static files are in /app/dist
# They will be copied to the nginx_static volume by the deploy script
FROM scratch AS export
COPY --from=builder /app/dist /dist
