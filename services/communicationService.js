// ================================================================
// SchoolOS – Communication Service
// All DB logic for messages, announcements, notifications
// ================================================================

const supabase = require('../config/supabaseClient');

// ================================================================
// sendMessage
// Inserts a direct message from one user to another.
// ================================================================
const sendMessage = async ({ school_id, sender_id, receiver_id, content }) => {
  const { data, error } = await supabase
    .from('messages')
    .insert({ school_id, sender_id, receiver_id, content })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ================================================================
// getMessages
// Fetches all messages where user is sender or receiver.
// Returns full conversation thread sorted by time.
// ================================================================
const getMessages = async (userId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
};

// ================================================================
// createAnnouncement
// Creates a school-wide or role-targeted announcement.
// ================================================================
const createAnnouncement = async ({
  school_id,
  created_by,
  title,
  content,
  target_roles,
  priority,
}) => {
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      school_id,
      created_by,
      title,
      content,
      target_roles: target_roles || ['all'],
      priority:     priority     || 'normal',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ================================================================
// createNotification
// Inserts a notification record for a user.
// ================================================================
const createNotification = async ({ user_id, title, body, type }) => {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id, title, body, type })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ================================================================
// getNotifications
// Fetches all notifications for a user.
// ================================================================
const getNotifications = async (userId) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false });

  if (error) throw error;
  return data;
};

module.exports = {
  sendMessage,
  getMessages,
  createAnnouncement,
  createNotification,
  getNotifications,
};