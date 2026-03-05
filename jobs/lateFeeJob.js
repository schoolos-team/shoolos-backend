// ================================================================
// SchoolOS – Late Fee Cron Job
// Runs daily at midnight.
// Checks all overdue outstanding fees.
// Adds 2% late fee per week.
// Sends reminder email to parent.
// ================================================================

const cron                 = require('node-cron');
const supabase             = require('../config/supabaseClient');
const { sendLateFeeReminder } = require('../services/emailService');

// ================================================================
// LATE FEE RULE:
// - 2% of original net_amount is added per week
// - "Per week" = every 7 overdue days
// - Example:
//     Day 1-6   → overdue, no late fee yet
//     Day 7     → 2% added (week 1)
//     Day 8-13  → no new fee
//     Day 14    → 2% added again (week 2)
//     Day 21    → 2% added again (week 3)
// ================================================================

const processLateFees = async () => {
  console.log('[LateFeeJob] Starting daily late fee check...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // ── Step 1: Fetch all overdue outstanding records ─────────────
    // Joins fee_assignments to get original net_amount and fee name
    const { data: overdueRecords, error: fetchError } = await supabase
      .from('outstanding')
      .select(`
        id,
        student_id,
        amount_due,
        due_date,
        overdue_days,
        late_fee_applied,
        fee_assignments (
          net_amount,
          fee_structures (
            name
          )
        )
      `)
      .lt('due_date', today.toISOString().split('T')[0])  // due_date < today
      .gt('amount_due', 0);                                // still has balance

    if (fetchError) throw fetchError;

    if (!overdueRecords || overdueRecords.length === 0) {
      console.log('[LateFeeJob] No overdue records found. Exiting.');
      return;
    }

    console.log(`[LateFeeJob] Found ${overdueRecords.length} overdue records.`);

    // ── Step 2: Process each overdue record ───────────────────────
    for (const record of overdueRecords) {
      try {
        const dueDate     = new Date(record.due_date);
        const newOverdueDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        const originalAmount = Number(record.fee_assignments?.net_amount || 0);
        const feeName        = record.fee_assignments?.fee_structures?.name || 'School Fee';

        // Calculate how many complete weeks are overdue
        const weeksOverdue     = Math.floor(newOverdueDays / 7);
        const prevWeeksOverdue = Math.floor(record.overdue_days / 7);

        // Only add late fee if a NEW week has passed since last update
        // This prevents adding 2% every day instead of every week
        let newLateFee    = 0;
        let newAmountDue  = Number(record.amount_due);

        if (weeksOverdue > prevWeeksOverdue && originalAmount > 0) {
          // 2% of original net_amount per new week
          newLateFee   = originalAmount * 0.02;
          newAmountDue = newAmountDue + newLateFee;

          console.log(
            `[LateFeeJob] Student ${record.student_id} | ` +
            `Fee: ${feeName} | ` +
            `Week ${weeksOverdue} | ` +
            `Late fee added: $${newLateFee.toFixed(2)}`
          );
        }

        // ── Step 3: Update the outstanding record ─────────────────
        const { error: updateError } = await supabase
          .from('outstanding')
          .update({
            overdue_days:     newOverdueDays,
            amount_due:       parseFloat(newAmountDue.toFixed(2)),
            late_fee_applied: parseFloat(
              (Number(record.late_fee_applied) + newLateFee).toFixed(2)
            ),
          })
          .eq('id', record.id);

        if (updateError) {
          console.error(
            `[LateFeeJob] Failed to update record ${record.id}:`,
            updateError.message
          );
          continue; // skip to next record, don't crash entire job
        }

        // ── Step 4: Send email reminder to parent ─────────────────
        // NOTE: parent_email comes from students table.
        // Once your teammate builds the students table,
        // replace this block with a real student lookup.
        // ─────────────────────────────────────────────────────────
        const parentEmail = await getParentEmail(record.student_id);

        if (parentEmail) {
          try {
            await sendLateFeeReminder({
              parentEmail,
              studentName:  record.student_id, // replace with real name later
              amountDue:    newAmountDue,
              lateFee:      newLateFee,
              feeName,
              dueDate:      record.due_date,
            });
            console.log(`[LateFeeJob] Email sent to ${parentEmail}`);
          } catch (emailError) {
            // Email failure should NOT stop the late fee update
            // Fee was already updated successfully above
            console.error(
              `[LateFeeJob] Email failed for student ${record.student_id}:`,
              emailError.message
            );
          }
        } else {
          console.warn(
            `[LateFeeJob] No parent email found for student ${record.student_id}. Skipping email.`
          );
        }

      } catch (recordError) {
        // One record failing should not stop the entire job
        console.error(
          `[LateFeeJob] Error processing record ${record.id}:`,
          recordError.message
        );
        continue;
      }
    }

    console.log('[LateFeeJob] Daily late fee check complete.');

  } catch (err) {
    console.error('[LateFeeJob] Fatal error:', err.message);
  }
};

// ================================================================
// getParentEmail
// Fetches parent email from students table.
//
// NOTE: This will work once your teammate builds the students table
// with a parent_email column.
// Until then it safely returns null and logs a warning.
// ================================================================
const getParentEmail = async (studentId) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('parent_email')
      .eq('id', studentId)
      .single();

    if (error || !data) return null;
    return data.parent_email || null;

  } catch {
    return null; // students table doesn't exist yet — safe fallback
  }
};

// ================================================================
// CRON SCHEDULE
// Runs every day at midnight (00:00)
// Cron format: second minute hour day month weekday
//
// '0 0 * * *' = at 00:00 every day
//
// To test immediately without waiting for midnight,
// temporarily change to: '*/1 * * * *' (every minute)
// Remember to change back after testing.
// ================================================================
const startLateFeeJob = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('[LateFeeJob] Triggered at:', new Date().toISOString());
    await processLateFees();
  });

  console.log('[LateFeeJob] Scheduled — runs daily at midnight');
};

// Export both so you can also trigger manually for testing
module.exports = { startLateFeeJob, processLateFees };