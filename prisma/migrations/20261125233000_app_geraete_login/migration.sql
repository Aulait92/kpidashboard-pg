-- App-Store-App: dauerhafte Anmeldung je Gerät hinter Face ID (lib/app-geraete-login.ts). Nur hinzufügend.
CREATE TABLE "AppGeraeteLogin" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "AppGeraeteLogin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppGeraeteLogin_tokenHash_key" ON "AppGeraeteLogin"("tokenHash");
CREATE INDEX "AppGeraeteLogin_userId_idx" ON "AppGeraeteLogin"("userId");
CREATE INDEX "AppGeraeteLogin_expiresAt_idx" ON "AppGeraeteLogin"("expiresAt");
ALTER TABLE "AppGeraeteLogin" ADD CONSTRAINT "AppGeraeteLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
