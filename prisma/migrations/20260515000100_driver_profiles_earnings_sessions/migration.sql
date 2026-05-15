-- Driver/passenger profile photos
ALTER TABLE "User" ADD COLUMN "photoUrl" TEXT;

-- Ride accounting and lifecycle timestamps
ALTER TABLE "Ride" ADD COLUMN "adminFee" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN "driverEarnings" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Ride" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- Driver work sessions: max 12 hours active, then 6 hours rest
CREATE TYPE "DriverSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'RESTING');

CREATE TABLE "DriverSession" (
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

CREATE INDEX "DriverSession_driverId_status_idx" ON "DriverSession"("driverId", "status");
CREATE INDEX "DriverSession_driverId_restUntil_idx" ON "DriverSession"("driverId", "restUntil");

ALTER TABLE "DriverSession" ADD CONSTRAINT "DriverSession_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
