// ================================================================
// SchoolOS – Finance Service
// All database logic lives here. Routes stay thin and clean.
// ================================================================

const supabase = require('../config/supabaseClient');

// ================================================================
// getOutstanding
// Fetch all unpaid fees for a student, joined with fee details.
// ================================================================
const getOutstanding = async (studentId) => {
  const { data, error } = await supabase
    .from('outstanding')
    .select(`
      id,
      amount_due,
      due_date,
      overdue_days,
      late_fee_applied,
      updated_at,
      fee_assignments (
        id,
        assigned_amount,
        discount,
        net_amount,
        fee_structures (
          name,
          frequency
        )
      )
    `)
    .eq('student_id', studentId)
    .gt('amount_due', 0)
    .order('due_date', { ascending: true });

  if (error) throw error;
  return data;
};

// ================================================================
// recordPayment  ←  ATOMIC
// Supabase JS v2 does not expose raw SQL transactions directly.
// We use a Supabase RPC (database function) to run both operations
// — insert payment + reduce outstanding — inside a single PostgreSQL
// transaction. If either step fails, both are rolled back.
//
// The SQL for this RPC is in database/functions.sql
// Run that file in Supabase SQL Editor before using this endpoint.
// ================================================================
const recordPayment = async ({ student_id, fee_assignment_id, amount, method, reference }) => {
  const { data, error } = await supabase.rpc('record_payment_atomic', {
    p_student_id        : student_id,
    p_fee_assignment_id : fee_assignment_id,
    p_amount            : Number(amount),
    p_method            : method,
    p_reference         : reference || null,
  });

  if (error) throw error;
  return data;
};

// ================================================================
// getSummary
// School-wide totals: total collected vs total outstanding.
// ================================================================
const getSummary = async () => {
  const [{ data: payments, error: e1 }, { data: outstanding, error: e2 }] =
    await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'paid'),
      supabase.from('outstanding').select('amount_due').gt('amount_due', 0),
    ]);

  if (e1) throw e1;
  if (e2) throw e2;

  const totalCollected   = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalOutstanding = outstanding.reduce((s, o) => s + Number(o.amount_due), 0);

  return {
    total_collected:   parseFloat(totalCollected.toFixed(2)),
    total_outstanding: parseFloat(totalOutstanding.toFixed(2)),
    net_balance:       parseFloat((totalCollected - totalOutstanding).toFixed(2)),
  };
};

// ================================================================
// applyDiscount
// Validates and applies a discount to a fee assignment.
// net_amount auto-recalculates in DB via GENERATED ALWAYS column.
// ================================================================
const applyDiscount = async (fee_assignment_id, discount) => {
  // Fetch first to validate
  const { data: assignment, error: fetchError } = await supabase
    .from('fee_assignments')
    .select('id, assigned_amount')
    .eq('id', fee_assignment_id)
    .single();

  if (fetchError || !assignment) {
    const err = new Error('Fee assignment not found');
    err.statusCode = 404;
    throw err;
  }

  if (Number(discount) > Number(assignment.assigned_amount)) {
    const err = new Error(
      `Discount (${discount}) cannot exceed assigned amount (${assignment.assigned_amount})`
    );
    err.statusCode = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('fee_assignments')
    .update({ discount: Number(discount) })
    .eq('id', fee_assignment_id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ================================================================
// getMonthlyReport
// Groups all paid payments by month for a given year.
// ================================================================
const getMonthlyReport = async (year) => {
  const { data: payments, error } = await supabase
    .from('payments')
    .select('amount, payment_date')
    .eq('status', 'paid')
    .gte('payment_date', `${year}-01-01`)
    .lte('payment_date', `${year}-12-31`)
    .order('payment_date', { ascending: true });

  if (error) throw error;

  const months = Array.from({ length: 12 }, (_, i) => ({
    month:           i + 1,
    month_name:      new Date(year, i, 1).toLocaleString('default', { month: 'long' }),
    total_collected: 0,
    payment_count:   0,
  }));

  payments.forEach((p) => {
    const idx = new Date(p.payment_date).getMonth();
    months[idx].total_collected += Number(p.amount);
    months[idx].payment_count   += 1;
  });

  months.forEach((m) => {
    m.total_collected = parseFloat(m.total_collected.toFixed(2));
  });

  return {
    year,
    year_total:     parseFloat(months.reduce((s, m) => s + m.total_collected, 0).toFixed(2)),
    monthly_report: months,
  };
};

module.exports = {
  getOutstanding,
  recordPayment,
  getSummary,
  applyDiscount,
  getMonthlyReport,
};