-- Idempotent repair for deployments where Prisma Client was updated
-- before the production database received the new columns.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "adminFee" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "driverEarnings" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriverSessionStatus') THEN
    CREATE TYPE "DriverSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'RESTING');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "DriverSession" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "restUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriverSession_driverId_status_idx" ON "DriverSession"("driverId", "status");
CREATE INDEX IF NOT EXISTS "DriverSession_driverId_restUntil_idx" ON "DriverSession"("driverId", "restUntil");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DriverSession_driverId_fkey'
  ) THEN
    ALTER TABLE "DriverSession"
      ADD CONSTRAINT "DriverSession_driverId_fkey"
      FOREIGN KEY ("driverId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
