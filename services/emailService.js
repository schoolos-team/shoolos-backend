// ================================================================
// SchoolOS – Email Service
// Handles all outgoing emails via Nodemailer + Gmail SMTP
// ================================================================

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('[EmailService] Gmail SMTP connection failed:', error.message);
  } else {
    console.log('[EmailService] Gmail SMTP ready');
  }
});

// ================================================================
// sendLateFeeReminder
// Sends a late fee reminder email to a parent.
// Works for ANY fee type — Term 1, Sports Fee, Annual Fee, etc.
// feeName is dynamic so it always shows the correct fee name.
//
// @param {string} parentEmail  - parent's email address
// @param {string} studentName  - student's name
// @param {number} amountDue    - current total amount due
// @param {number} lateFee      - late fee added this week
// @param {string} feeName      - name of the fee (dynamic, any fee)
// @param {string} dueDate      - original due date
// ================================================================
const sendLateFeeReminder = async ({
  parentEmail,
  studentName,
  amountDue,
  lateFee,
  feeName,
  dueDate,
}) => {
  const mailOptions = {
    from: `"SchoolOS Finance" <${process.env.EMAIL_USER}>`,
    to: parentEmail,
    subject: `Fee Reminder – ${feeName} is Overdue`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Fee Payment Reminder</h2>
        <p>Dear Parent,</p>
        <p>
          This is a reminder that the following fee for
          <strong>${studentName}</strong> is overdue.
        </p>

        <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background:#f5f5f5;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Fee</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">${feeName}</td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Original Due Date</strong></td>
            <td style="padding:10px; border:1px solid #ddd;">${dueDate}</td>
          </tr>
          <tr style="background:#f5f5f5;">
            <td style="padding:10px; border:1px solid #ddd;"><strong>Late Fee Added</strong></td>
            <td style="padding:10px; border:1px solid #ddd; color:#d32f2f;">
              +₹${lateFee.toFixed(2)} (2% per week)
            </td>
          </tr>
          <tr>
            <td style="padding:10px; border:1px solid #ddd;"><strong>Total Amount Due</strong></td>
            <td style="padding:10px; border:1px solid #ddd; color:#d32f2f;">
              <strong>₹${amountDue.toFixed(2)}</strong>
            </td>
          </tr>
        </table>

        <p>Please make the payment as soon as possible to avoid further late charges.</p>
        <p>A 2% late fee is added every week until the balance is cleared.</p>

        <br/>
        <p>Regards,</p>
        <p><strong>SchoolOS Finance Team</strong></p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendLateFeeReminder };