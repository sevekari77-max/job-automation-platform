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
RUN npm run build -w apps/worker

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/worker/dist ./apps/worker/dist
COPY --from=base /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/package.json

EXPOSE 10000

CMD ["sh", "-c", "node -e \"require('http').createServer((req,res)=>{res.writeHead(200);res.end('worker ok')}).listen(process.env.PORT || 10000,'0.0.0.0')\" & exec node apps/worker/dist/index.js"]