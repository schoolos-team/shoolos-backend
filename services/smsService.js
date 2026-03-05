// ================================================================
// SchoolOS – SMS Service
// Sends SMS via Twilio free trial
// ================================================================

const twilio = require('twilio');

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE;

if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_PHONE) {
  console.error('[SMSService] Twilio credentials missing in .env');
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// ================================================================
// sendSMS
// Sends a plain text SMS to any phone number.
// @param {string} to      - recipient phone number e.g. +919876543210
// @param {string} message - SMS body text
// ================================================================
const sendSMS = async (to, message) => {
  const result = await client.messages.create({
    body: message,
    from: TWILIO_PHONE,
    to,
  });
  return result.sid;
};

// ================================================================
// sendLateFeeSmS
// Pre-formatted SMS for late fee reminders.
// ================================================================
const sendLateFeeSmS = async ({ to, studentName, feeName, amountDue }) => {
  const message =
    `SchoolOS: Dear Parent, fees for ${studentName} are overdue. ` +
    `Fee: ${feeName}. Amount Due: Rs.${amountDue}. Please pay immediately to avoid further late charges.`;

  return sendSMS(to, message);
};

module.exports = { sendSMS, sendLateFeeSmS };