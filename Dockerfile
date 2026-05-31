FROM node:26-slim AS build
WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build


FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

RUN npm audit --omit=dev --audit-level=high

COPY --from=build /app/dist ./dist
USER node

CMD ["node", "dist/index.js"]
