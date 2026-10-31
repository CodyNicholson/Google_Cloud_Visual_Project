# Production image: Vite builds a minified bundle, unprivileged nginx serves it on port 80. No backend.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Test stage: `docker build --target test ./frontend` runs the Vitest suite
FROM build AS test
RUN npm test

# Unprivileged nginx runs as uid 101, not root. It can still listen on 80 because Docker lets
# containers bind low ports (net.ipv4.ip_unprivileged_port_start=0).
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
