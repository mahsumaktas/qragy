FROM node:18-bookworm-slim

WORKDIR /app

# Dependency layer (cache friendly)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application layer
COPY server.js ./
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY public/ ./public/
COPY knowledge_base.example.csv ./
COPY .env.example ./

# Default dirs (volumes override these)
RUN mkdir -p data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["sh", "-c", "if [ ! -d data/lancedb ]; then node scripts/ingest.js || true; fi && node server.js"]
