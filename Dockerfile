FROM node:22-slim
WORKDIR /app
# build tools only used if better-sqlite3 has no prebuilt binary for this platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production \
    PORT=8080 \
    PA_DATA_DIR=/data
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
