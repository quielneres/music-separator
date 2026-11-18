FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5050

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 -G appgroup appuser

COPY --from=builder /app/node_modules ./node_modules
COPY . .

USER appuser

EXPOSE 5050

CMD ["node", "src/index.js"]
