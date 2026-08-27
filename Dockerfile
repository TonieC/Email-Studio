FROM node:20-alpine

WORKDIR /app

# Install native build deps for better-sqlite3, then run postinstall build.
# Node 20 alpine bundles python3/make/g++ already; keep them minimal.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

VOLUME ["/app/data"]

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
