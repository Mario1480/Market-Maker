-- Add idle logout settings per user
ALTER TABLE "User" ADD COLUMN "autoLogoutEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "autoLogoutMinutes" INTEGER NOT NULL DEFAULT 60;

-- Track session activity for idle timeout
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
