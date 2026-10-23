FROM node:24

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN corepack enable pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN NODE_ENV=development pnpm install --frozen-lockfile

COPY . .
ENV API_PROXY_TARGET=http://api:8000 \
    NEXT_PUBLIC_APP_DOMAIN=localhost
RUN pnpm build \
 && cp -r .next/static .next/standalone/.next/static \
 && cp -r public .next/standalone/public

EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]

