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

# Sentry: NEXT_PUBLIC_SENTRY_DSN wird beim Build in den Browser-Code
# eingebettet. Railway reicht Service-Variablen automatisch als Build-Args
# durch, wenn sie hier als ARG deklariert sind.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Push (Web Push): der öffentliche VAPID-Schlüssel wird ebenfalls in den
# Browser-Code eingebettet – ohne ihn meldet der Kundenbereich „Benachrichtigungen
# sind auf dem Server noch nicht eingerichtet“.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Sentry Source-Map-Upload: nur als Build-Arg (kein ENV), damit der Token
# nicht in der Laufzeit-Umgebung des Containers landet. Ohne Token baut
# next build normal, nur ohne Upload. Der Wert ändert den Build-Cache-Key,
# daher baut Railway nach dem Setzen auch wirklich neu.
ARG SENTRY_AUTH_TOKEN
# Commit-ID als Sentry-Release (vom SDK automatisch erkannt).
ARG RAILWAY_GIT_COMMIT_SHA
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
