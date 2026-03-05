-- ================================================================
-- SchoolOS – Finance Engine
-- Role   : Member 5 – Finance & Communication Engineer
-- DB     : Supabase (PostgreSQL)
-- Goal   : Production-safe, clean, minimal, fully justified
-- Last   : Final audited version – safe to run in Supabase SQL Editor
-- ================================================================


-- ================================================================
-- TABLE 1: fee_structures
-- Master list of fee types defined by a school.
-- Created once by admin, assigned to many students.
-- ================================================================
CREATE TABLE fee_structures (
  id          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid          NOT NULL,
  name        text          NOT NULL,
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  frequency   text          NOT NULL CHECK (
                frequency IN ('monthly', 'termly', 'annually', 'one-time')
              ),
  due_date    date          NOT NULL,
  is_active   boolean       NOT NULL DEFAULT true,
  created_at  timestamp     DEFAULT now()
);

/*
  JUSTIFICATION:
  ─────────────
  id uuid              → No sequential IDs. UUIDs are safe, non-guessable,
                         and work across distributed systems.

  school_id uuid       → Multi-school support from day 1. Every fee belongs
                         to a school. No FK yet because schools table is being
                         built by another team member in parallel.

  amount numeric(10,2) → NEVER use float for money. Float has rounding errors.
                         numeric(10,2) = exact decimal, up to 99,999,999.99.

  CHECK amount > 0     → A fee of $0 or -$50 is invalid. DB rejects it before
                         it ever reaches your app layer.

  frequency CHECK      → Restricts to known billing cycles only. Prevents
                         garbage values like "bi-weekly-ish" entering the DB.

  due_date date        → Date only, no time component. Fees are due on a day,
                         not at a specific hour.
                         NOTE: For monthly/termly fees, this is the first cycle
                         due date. Per-cycle due dates live in outstanding table.
                         Revisit post-MVP if needed.

  is_active boolean    → Soft delete flag. Instead of deleting a fee structure
                         (which breaks historical records), mark it inactive.
                         Safe for audits and reporting.

  created_at           → Audit trail. Zero cost to add, invaluable later.
*/


-- ================================================================
-- TABLE 2: fee_assignments
-- Links a fee_structure to a specific student.
-- Stores per-student discount and auto-calculates net payable amount.
-- ================================================================
CREATE TABLE fee_assignments (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        uuid          NOT NULL,
  fee_structure_id  uuid          NOT NULL
                      REFERENCES fee_structures(id) ON DELETE RESTRICT,
  assigned_amount   numeric(10,2) NOT NULL CHECK (assigned_amount > 0),
  discount          numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  net_amount        numeric(10,2) GENERATED ALWAYS AS (assigned_amount - discount) STORED,
  created_at        timestamp     DEFAULT now(),

  -- Prevent duplicate assignment of same fee to same student
  UNIQUE (student_id, fee_structure_id),

  -- FIX 1: Discount cannot exceed the assigned amount (prevents negative net_amount)
  CONSTRAINT chk_discount_not_exceed_amount CHECK (discount <= assigned_amount)
);

/*
  JUSTIFICATION:
  ─────────────
  student_id            → Links to the student. No FK yet (parallel dev),
                         but UUID typed and indexed below.

  fee_structure_id FK   → Hard reference. You cannot assign a fee that doesn't
                         exist. DB enforces this, not just your app code.

  ON DELETE RESTRICT    → Blocks deletion of a fee_structure that has live
                         assignments. Protects financial history. Critical for
                         school audits and fee reports.

  assigned_amount       → Renamed from 'amount' for clarity. This is the gross
                         amount before discount. Makes queries self-documenting.

  discount DEFAULT 0    → Most students have no discount. Safe default means
                         you don't have to pass discount = 0 every time.

  CHECK discount >= 0   → Discount can be zero but never negative.

  chk_discount_not_exceed_amount
                        → Prevents discount > assigned_amount which would make
                         net_amount negative. A student cannot receive more
                         discount than the fee itself.

  net_amount GENERATED  → DB computes (assigned_amount - discount) automatically
                         on every insert/update. Eliminates the bug where app
                         code forgets to subtract discount before storing.
                         STORED = saved physically, queryable like a normal column.

  UNIQUE constraint     → Prevents assigning the same fee twice to the same
                         student. Without this, a double-click on the frontend
                         creates two identical fee rows silently.
*/


-- ================================================================
-- TABLE 3: payments
-- Records every payment transaction.
-- One row = one payment event. Append-only by design.
-- ================================================================
CREATE TABLE payments (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        uuid          NOT NULL,
  fee_assignment_id uuid
                      REFERENCES fee_assignments(id) ON DELETE SET NULL,
  amount            numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_date      date          NOT NULL DEFAULT current_date,
  method            text          NOT NULL CHECK (
                      method IN ('cash', 'bank_transfer', 'card', 'mobile_money', 'cheque')
                    ),
  reference         text,
  status            text          NOT NULL DEFAULT 'paid' CHECK (
                      status IN ('paid', 'pending', 'failed', 'reversed')
                    ),
  created_at        timestamp     DEFAULT now()
);

/*
  JUSTIFICATION:
  ─────────────
  student_id direct     → Kept on payments table so you can query all payments
                         for a student without a join. Performance-friendly for
                         the summary endpoint.

  fee_assignment_id FK  → Links each payment to the exact fee being paid.
                         Essential for GET /outstanding/:studentId and summary
                         report. Without this you can't answer "was this
                         payment for Term 1 or Sports fee?"

  ON DELETE SET NULL    → If a fee assignment is deleted (edge case), the
                         payment row stays intact with fee_assignment_id = NULL.
                         Financial records are NEVER deleted. Non-negotiable
                         for any money system.

  payment_date date     → Renamed from 'date' — 'date' is a reserved word in SQL.
                         Using it as a column name causes subtle bugs and
                         requires quoting everywhere.

  CHECK method          → Only known payment modes accepted. Enforced at DB level.

  reference nullable    → Cash payments have no transaction reference. Nullable
                         is correct here. Card/bank transfers will populate this.

  status DEFAULT 'paid' → Most recorded payments are completed. 'reversed' handles
                         refunds. 'failed' handles gateway failures without
                         deleting rows.

  Append-only design    → Payments are NEVER updated or deleted in any money system.
                         Add a 'reversed' row for refunds. Preserves full ledger.
*/


-- ================================================================
-- TABLE 4: outstanding
-- Tracks unpaid balance per student per fee assignment.
-- This is the table your cron job reads and UPDATEs daily.
-- One row per student per fee. Never duplicated.
-- ================================================================
CREATE TABLE outstanding (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        uuid          NOT NULL,
  fee_assignment_id uuid
                      REFERENCES fee_assignments(id) ON DELETE CASCADE,
  amount_due        numeric(10,2) NOT NULL CHECK (amount_due >= 0),
  due_date          date          NOT NULL,
  overdue_days      integer       NOT NULL DEFAULT 0 CHECK (overdue_days >= 0),
  late_fee_applied  numeric(10,2) NOT NULL DEFAULT 0 CHECK (late_fee_applied >= 0),
  created_at        timestamp     DEFAULT now(),
  updated_at        timestamp     DEFAULT now(),

  -- FIX 2: Prevents duplicate outstanding rows for same student + fee
  -- Without this, cron job processes the same debt twice
  UNIQUE (student_id, fee_assignment_id)
);

/*
  JUSTIFICATION:
  ─────────────
  fee_assignment_id FK  → Links outstanding balance to a specific fee assignment.
                         Without this, cron job cannot know WHICH fee is overdue.

  ON DELETE CASCADE     → If a fee assignment is removed, its outstanding record
                         is auto-cleaned. Prevents ghost debt records.

  amount_due >= 0       → Can be 0 (fully paid, before row is cleared).
                         Cannot be negative (negative debt makes no sense).

  overdue_days          → Cron job updates this daily. Used to calculate which
                         week bracket the student is in for 2% per week rule.
                         Week 1 = days 1-7, Week 2 = days 8-14, etc.

  late_fee_applied      → Tracks cumulative late fee already added.
                         Without this, cron job has no memory between runs —
                         it would add 2% every day instead of once per week.

  updated_at            → Cron job uses this to confirm last update time.
                         Useful for debugging stale records.

  UNIQUE (student_id, fee_assignment_id)
                        → One outstanding record per student per fee. Prevents
                         cron job from processing duplicate debt rows and
                         double-charging late fees.
*/


-- ================================================================
-- TRIGGER: auto-update updated_at on outstanding
-- Cron job updates outstanding rows daily.
-- Trigger guarantees updated_at is always accurate without relying
-- on app/cron code to set it manually.
-- ================================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_outstanding_updated_at
BEFORE UPDATE ON outstanding
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();


-- ================================================================
-- INDEXES
-- Without indexes every query does a full table scan.
-- As data grows (1000+ students), unindexed queries become slow.
-- These 4 indexes cover every query pattern your APIs and cron use.
-- ================================================================

-- GET /outstanding/:studentId → filters fee_assignments by student
CREATE INDEX idx_fee_assignments_student_id ON fee_assignments(student_id);

-- GET /finance/summary + payment history → filters payments by student
CREATE INDEX idx_payments_student_id        ON payments(student_id);

-- GET /outstanding/:studentId → filters outstanding by student
CREATE INDEX idx_outstanding_student_id     ON outstanding(student_id);

-- Cron job: WHERE due_date < today → runs every day, must be fast
CREATE INDEX idx_outstanding_due_date       ON outstanding(due_date);