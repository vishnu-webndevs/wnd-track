# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production Stage
FROM nginx:alpine

RUN apk add --no-cache curl \
 && rm /etc/nginx/conf.d/default.conf

ENV NGINX_LISTEN_PORT=80
ENV BACKEND_HOST=tracker-backend
ENV BACKEND_PORT=8080

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
RUN mkdir -p /usr/share/nginx/html/track_app

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:${NGINX_LISTEN_PORT}/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
