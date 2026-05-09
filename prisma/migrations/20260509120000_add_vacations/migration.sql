-- CreateEnum
CREATE TYPE "vacation_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "vacation_status" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacations_employee_id_idx" ON "vacations"("employee_id");

-- CreateIndex
CREATE INDEX "vacations_status_idx" ON "vacations"("status");

-- CreateIndex
CREATE INDEX "vacations_start_date_end_date_idx" ON "vacations"("start_date", "end_date");

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
