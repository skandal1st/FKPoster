# Stage 1: Build React client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
COPY client/scripts/ ./scripts/
RUN npm ci
COPY client/ ./
ARG VITE_BASE_DOMAIN=lvh.me
ENV VITE_BASE_DOMAIN=$VITE_BASE_DOMAIN
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
RUN npm install pm2 -g
COPY server/ ./
COPY --from=client-build /app/client/dist ./public

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["pm2-runtime", "ecosystem.config.js"]
