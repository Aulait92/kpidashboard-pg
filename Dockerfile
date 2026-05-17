# Microsofts offizielles Playwright-Image bringt Chromium + alle System-Libs
# (libnss3, libatk, libdrm, ...) bereits mit. Spart uns das manuelle
# apt-get-Geraffel und garantiert dass die Browser-Version zur Playwright-
# JS-Version passt.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Dependencies separat installieren für besseres Layer-Caching.
# prisma/ + prisma.config.ts müssen vor `npm ci` da sein, weil das
# postinstall-Script `prisma generate` ausführt und sonst das Schema
# nicht findet.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# next build braucht eine DATABASE_URL für `prisma generate` (Schema-Validation),
# aber für den Build selbst reicht ein Dummy-Wert — die Runtime nutzt dann die
# echte Env-Variable von Railway.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
