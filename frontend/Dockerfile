FROM node:22-alpine AS build
WORKDIR /web
COPY package*.json ./
RUN npm ci --registry=https://registry.npmjs.org
COPY . .
RUN npm run build
FROM caddy:2-alpine
COPY --from=build /web/dist /srv
