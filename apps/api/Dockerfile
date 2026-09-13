FROM node:24-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci

COPY . .

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_automation?schema=public

RUN npx prisma generate
RUN npm run build -w packages/shared
RUN npm run build -w apps/api

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/prisma.config.ts ./prisma.config.ts

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]