# --- build stage: install all dependencies and compile TypeScript ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- production dependencies ---
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# --- runtime ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

# The default transport is stdio. To serve Streamable HTTP instead, run with:
#   docker run -e MCP_TRANSPORT=http -e PORT=3002 -p 3002:3002 <image>
# (PORT defaults to 3002 in http mode.)
EXPOSE 3002

USER node

CMD ["node", "build/index.js"]
