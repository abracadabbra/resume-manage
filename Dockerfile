ARG NGINX_IMAGE=nginx:alpine

# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependency files first for better layer caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy source code
COPY . .

# Build the app (skip type-check for faster builds)
RUN npm run build-only

# Stage 2: Serve with Nginx
FROM ${NGINX_IMAGE}

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
