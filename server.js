// ================================================================
// SchoolOS – Main Server
// Role   : Finance & Communication Engineer (Member 5)
// ================================================================

require('dotenv').config();

const express  = require('express');
const morgan   = require('morgan');
const supabase = require('./config/supabaseClient');

const financeRoutes       = require('./routes/finance');
const communicationRoutes = require('./routes/communication');
const { startLateFeeJob } = require('./jobs/lateFeeJob');

const app = express();

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Auth Middleware Slot ─────────────────────────────────────────
// When Member 4 (Auth engineer) is ready, uncomment these 2 lines:
// const { verifyToken } = require('./middleware/auth');
// app.use('/api', verifyToken);

// ── Health Check ─────────────────────────────────────────────────
// Used by deployment platforms to confirm server is alive.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ================================================================
// ⚠️  DEVELOPMENT ONLY ROUTES
// These are auto-disabled when NODE_ENV=production
// REMOVE THIS ENTIRE BLOCK before final deployment
// ================================================================
if (process.env.NODE_ENV !== 'production') {

  // Test 1: Supabase connection check
  app.get('/test-db', async (req, res) => {
    try {
      const { error } = await supabase
        .from('fee_structures')
        .select('id')
        .limit(1);
      if (error) throw error;
      res.json({ status: 'ok', message: 'Supabase connected' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Test 2: Email test — sends real email to confirm Gmail SMTP works
  // ⚠️  REMOVE THIS ROUTE AFTER TESTING EMAIL
  app.get('/test-email', async (req, res) => {
    try {
      const { sendLateFeeReminder } = require('./services/emailService');
      await sendLateFeeReminder({
        parentEmail: 'divyak121654@gmail.com',
        studentName: 'Test Student',
        amountDue:   409.00,
        lateFee:     9.00,
        feeName:     'Term 1 Tuition',
        dueDate:     '2025-01-01',
      });
      res.json({ status: 'ok', message: 'Test email sent successfully' });
    } catch (err) {
      console.error('[/test-email]', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

}
// ================================================================
// ⚠️  END OF DEVELOPMENT ONLY ROUTES
// ================================================================

// ── Finance Routes ───────────────────────────────────────────────
app.use('/api/finance', financeRoutes);

// ── Communication Routes ─────────────────────────────────────────
app.use('/api', communicationRoutes);

// ── 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ── Global Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

// ── Start Server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[SchoolOS] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  startLateFeeJob();
});