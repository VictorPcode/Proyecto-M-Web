ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "driverBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "driverBlockedReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionDebt" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "underchargeDebt" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "delinquencyCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3);

ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "officialFare" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "collectedFare" DOUBLE PRECISION;
ALTER TABLE "Ride" ADD COLUMN IF NOT EXISTS "underchargeAmount" DOUBLE PRECISION DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriverCommissionSettlementStatus') THEN
    CREATE TYPE "DriverCommissionSettlementStatus" AS ENUM ('PENDING', 'PAID');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "DriverCommissionSettlement" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "amountDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paidAt" TIMESTAMP(3),
  "receiptNumber" TEXT,
  "status" "DriverCommissionSettlementStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverCommissionSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DriverCommissionDeposit" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "managedById" TEXT,
  "driverName" TEXT NOT NULL,
  "managedByName" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "delinquencyCountAtRelease" INTEGER NOT NULL,
  "managedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverCommissionDeposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverCommissionSettlement_driverId_serviceDate_key"
  ON "DriverCommissionSettlement"("driverId", "serviceDate");
CREATE INDEX IF NOT EXISTS "DriverCommissionSettlement_driverId_status_idx"
  ON "DriverCommissionSettlement"("driverId", "status");
CREATE INDEX IF NOT EXISTS "DriverCommissionDeposit_driverId_managedAt_idx"
  ON "DriverCommissionDeposit"("driverId", "managedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DriverCommissionSettlement_driverId_fkey'
  ) THEN
    ALTER TABLE "DriverCommissionSettlement"
      ADD CONSTRAINT "DriverCommissionSettlement_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DriverCommissionDeposit_driverId_fkey'
  ) THEN
    ALTER TABLE "DriverCommissionDeposit"
      ADD CONSTRAINT "DriverCommissionDeposit_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DriverCommissionDeposit_managedById_fkey'
  ) THEN
    ALTER TABLE "DriverCommissionDeposit"
      ADD CONSTRAINT "DriverCommissionDeposit_managedById_fkey"
      FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
