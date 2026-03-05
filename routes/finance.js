// ================================================================
// SchoolOS – Finance Routes
// Routes are intentionally thin. All logic is in financeService.js
// ================================================================

const express        = require('express');
const router         = express.Router();
const financeService = require('../services/financeService');

// ── Helper ───────────────────────────────────────────────────────
const sendError = (res, status, message) =>
  res.status(status).json({ status: 'error', message });

// ── UUID format check ─────────────────────────────────────────────
const isValidUUID = (val) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

// ================================================================
// GET /api/finance/outstanding/:studentId
// Returns all unpaid fees for a student with fee details.
// ================================================================
router.get('/outstanding/:studentId', async (req, res) => {
  const { studentId } = req.params;

  if (!isValidUUID(studentId)) {
    return sendError(res, 400, 'Invalid studentId format');
  }

  try {
    const data = await financeService.getOutstanding(studentId);
    res.json({
      status:            'ok',
      student_id:        studentId,
      outstanding_count: data.length,
      outstanding:       data,
    });
  } catch (err) {
    console.error('[GET /outstanding/:studentId]', err.message);
    sendError(res, 500, 'Failed to fetch outstanding fees');
  }
});

// ================================================================
// POST /api/finance/payment
// Records a payment atomically (payment insert + outstanding update
// happen together in one DB transaction via Supabase RPC).
// Body: { student_id, fee_assignment_id, amount, method, reference? }
// ================================================================
router.post('/payment', async (req, res) => {
  const { student_id, fee_assignment_id, amount, method, reference } = req.body;

  // Validate all required fields
  if (!student_id || !isValidUUID(student_id))
    return sendError(res, 400, 'Valid student_id (UUID) is required');

  if (!fee_assignment_id || !isValidUUID(fee_assignment_id))
    return sendError(res, 400, 'Valid fee_assignment_id (UUID) is required');

  if (!amount || isNaN(amount) || Number(amount) <= 0)
    return sendError(res, 400, 'amount must be a positive number');

  const allowedMethods = ['cash', 'bank_transfer', 'card', 'mobile_money', 'cheque'];
  if (!method || !allowedMethods.includes(method))
    return sendError(res, 400, `method must be one of: ${allowedMethods.join(', ')}`);

  try {
    const payment = await financeService.recordPayment({
      student_id,
      fee_assignment_id,
      amount,
      method,
      reference,
    });

    res.status(201).json({
      status:  'ok',
      message: 'Payment recorded successfully',
      payment,
    });
  } catch (err) {
    console.error('[POST /payment]', err.message);
    sendError(res, 500, 'Failed to record payment');
  }
});

// ================================================================
// GET /api/finance/summary
// Returns school-wide total collected vs total outstanding.
// ================================================================
router.get('/summary', async (req, res) => {
  try {
    const summary = await financeService.getSummary();
    res.json({ status: 'ok', summary });
  } catch (err) {
    console.error('[GET /summary]', err.message);
    sendError(res, 500, 'Failed to fetch summary');
  }
});

// ================================================================
// POST /api/finance/discount
// Applies a discount to a fee assignment.
// Body: { fee_assignment_id, discount }
// ================================================================
router.post('/discount', async (req, res) => {
  const { fee_assignment_id, discount } = req.body;

  if (!fee_assignment_id || !isValidUUID(fee_assignment_id))
    return sendError(res, 400, 'Valid fee_assignment_id (UUID) is required');

  if (discount === undefined || discount === null || isNaN(discount) || Number(discount) < 0)
    return sendError(res, 400, 'discount must be a non-negative number');

  try {
    const updated = await financeService.applyDiscount(fee_assignment_id, discount);
    res.json({
      status:         'ok',
      message:        'Discount applied successfully',
      fee_assignment: updated,
    });
  } catch (err) {
    console.error('[POST /discount]', err.message);
    sendError(res, err.statusCode || 500, err.message || 'Failed to apply discount');
  }
});

// ================================================================
// GET /api/finance/report
// Monthly revenue report grouped by month.
// Optional query: ?year=2025 (defaults to current year)
// ================================================================
router.get('/report', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  if (year < 2000 || year > 2100)
    return sendError(res, 400, 'year must be a valid 4-digit year');

  try {
    const report = await financeService.getMonthlyReport(year);
    res.json({ status: 'ok', ...report });
  } catch (err) {
    console.error('[GET /report]', err.message);
    sendError(res, 500, 'Failed to generate report');
  }
});

module.exports = router;