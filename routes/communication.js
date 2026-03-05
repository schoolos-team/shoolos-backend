// ================================================================
// SchoolOS – Communication Routes
// Base: /api/messages, /api/announcements, /api/notify
// ================================================================

const express              = require('express');
const router               = express.Router();
const communicationService = require('../services/communicationService');
const { sendLateFeeReminder } = require('../services/emailService');
const { sendSMS }          = require('../services/smsService');

// ── Helper ───────────────────────────────────────────────────────
const sendError = (res, status, message) =>
  res.status(status).json({ status: 'error', message });

const isValidUUID = (val) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

// ================================================================
// POST /api/messages/send
// Sends a direct message from one user to another.
// Body: { school_id, sender_id, receiver_id, content }
// ================================================================
router.post('/messages/send', async (req, res) => {
  const { school_id, sender_id, receiver_id, content } = req.body;

  if (!school_id   || !isValidUUID(school_id))   return sendError(res, 400, 'Valid school_id is required');
  if (!sender_id   || !isValidUUID(sender_id))   return sendError(res, 400, 'Valid sender_id is required');
  if (!receiver_id || !isValidUUID(receiver_id)) return sendError(res, 400, 'Valid receiver_id is required');
  if (!content     || content.trim() === '')     return sendError(res, 400, 'content is required');

  try {
    const message = await communicationService.sendMessage({
      school_id,
      sender_id,
      receiver_id,
      content: content.trim(),
    });

    res.status(201).json({
      status:  'ok',
      message: 'Message sent successfully',
      data:    message,
    });
  } catch (err) {
    console.error('[POST /messages/send]', err.message);
    sendError(res, 500, 'Failed to send message');
  }
});

// ================================================================
// GET /api/messages/:userId
// Returns full conversation thread for a user.
// ================================================================
router.get('/messages/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!isValidUUID(userId)) return sendError(res, 400, 'Invalid userId format');

  try {
    const messages = await communicationService.getMessages(userId);
    res.json({
      status:        'ok',
      user_id:       userId,
      message_count: messages.length,
      messages,
    });
  } catch (err) {
    console.error('[GET /messages/:userId]', err.message);
    sendError(res, 500, 'Failed to fetch messages');
  }
});

// ================================================================
// POST /api/announcements
// Creates a school-wide or role-targeted announcement.
// Body: { school_id, created_by, title, content, target_roles?, priority? }
// ================================================================
router.post('/announcements', async (req, res) => {
  const { school_id, created_by, title, content, target_roles, priority } = req.body;

  if (!school_id  || !isValidUUID(school_id))  return sendError(res, 400, 'Valid school_id is required');
  if (!created_by || !isValidUUID(created_by)) return sendError(res, 400, 'Valid created_by is required');
  if (!title      || title.trim() === '')      return sendError(res, 400, 'title is required');
  if (!content    || content.trim() === '')    return sendError(res, 400, 'content is required');

  const allowedPriorities = ['normal', 'high', 'urgent'];
  if (priority && !allowedPriorities.includes(priority)) {
    return sendError(res, 400, `priority must be one of: ${allowedPriorities.join(', ')}`);
  }

  try {
    const announcement = await communicationService.createAnnouncement({
      school_id,
      created_by,
      title:        title.trim(),
      content:      content.trim(),
      target_roles,
      priority,
    });

    res.status(201).json({
      status:       'ok',
      message:      'Announcement created successfully',
      announcement,
    });
  } catch (err) {
    console.error('[POST /announcements]', err.message);
    sendError(res, 500, 'Failed to create announcement');
  }
});

// ================================================================
// POST /api/notify/email
// Sends an email notification to a parent.
// Body: { parentEmail, studentName, feeName, amountDue, lateFee, dueDate }
// ================================================================
router.post('/notify/email', async (req, res) => {
  const { parentEmail, studentName, feeName, amountDue, lateFee, dueDate } = req.body;

  if (!parentEmail) return sendError(res, 400, 'parentEmail is required');
  if (!studentName) return sendError(res, 400, 'studentName is required');
  if (!feeName)     return sendError(res, 400, 'feeName is required');
  if (!amountDue)   return sendError(res, 400, 'amountDue is required');

  try {
    await sendLateFeeReminder({
      parentEmail,
      studentName,
      feeName,
      amountDue:  Number(amountDue),
      lateFee:    Number(lateFee || 0),
      dueDate:    dueDate || 'N/A',
    });

    res.json({
      status:  'ok',
      message: `Email sent to ${parentEmail}`,
    });
  } catch (err) {
    console.error('[POST /notify/email]', err.message);
    sendError(res, 500, 'Failed to send email');
  }
});

// ================================================================
// POST /api/notify/sms
// Sends an SMS notification via Twilio.
// Body: { to, message }
// ================================================================
router.post('/notify/sms', async (req, res) => {
  const { to, message } = req.body;

  if (!to)      return sendError(res, 400, 'to (phone number) is required');
  if (!message) return sendError(res, 400, 'message is required');

  // Phone number must start with + and country code
  if (!to.startsWith('+')) {
    return sendError(res, 400, 'Phone number must include country code e.g. +919876543210');
  }

  try {
    const sid = await sendSMS(to, message);
    res.json({
      status:  'ok',
      message: 'SMS sent successfully',
      sid,
    });
  } catch (err) {
    console.error('[POST /notify/sms]', err.message);
    sendError(res, 500, 'Failed to send SMS');
  }
});

module.exports = router;