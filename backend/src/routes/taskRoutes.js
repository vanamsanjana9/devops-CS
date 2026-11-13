const express = require('express');
const path = require('path');
const crypto = require('crypto');
const TaskAttachment = require('../models/TaskAttachment');
const {
  getTasks,
  getTaskById,
  updateTask,
  rescheduleFollowingWeeklyDeadlines,
  reviewTask,
  addTaskMilestoneFeedback,
  reviewTaskMilestoneFeedback,
  deleteTask,
  getTaskStats,
  submitTask,
  persistDashboardState,
  addTaskComment,
  addTaskAttachment,
  isPublicHolidayDate,
  moveDeadlineOffHoliday
} = require('../data/mockData');

const router = express.Router();
const allowedPriorities = ['High', 'Medium', 'Low'];
const fileTypes = {
  'application/pdf': { extension: '.pdf', signature: (buffer) => buffer.subarray(0, 5).toString() === '%PDF-' },
  'image/png': { extension: '.png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/jpeg': { extension: '.jpg', signature: (buffer) => buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 },
  'text/plain': { extension: '.txt', signature: () => true }
};
async function saveState(next) {
  try {
    await persistDashboardState();
    return true;
  } catch (error) {
    next(error);
    return false;
  }
}

router.get('/', (req, res) => {
  res.json({ tasks: getTasks() });
});

router.get('/stats', (req, res) => {
  res.json({ stats: getTaskStats() });
});

router.post('/', (req, res) => {
  return res.status(403).json({ message: 'Tasks are assigned automatically by the weekly milestone agent.' });
});

router.post('/:id/submit', async (req, res, next) => {
  const role = typeof req.body?.role === 'string' ? req.body.role : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (role !== 'Student' || !email) {
    return res.status(403).json({ message: 'Only a student assigned to this team can submit this task.' });
  }
  const task = submitTask(req.params.id, email);
  if (!task) return res.status(409).json({ message: 'This task cannot be submitted in its current state.' });
  if (!await saveState(next)) return;
  return res.json({ task });
});

router.patch('/:id/milestones/:weekIndex/feedback', async (req, res, next) => {
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : '';
  const role = req.body?.role;
  if (!['Guide', 'Coordinator'].includes(role)) {
    return res.status(403).json({ message: 'Only a guide or coordinator can leave weekly feedback.' });
  }
  if (!feedback || feedback.length > 2000) {
    return res.status(400).json({ message: 'Weekly feedback must contain 1 to 2,000 characters.' });
  }
  const task = addTaskMilestoneFeedback(
    req.params.id,
    Number(req.params.weekIndex),
    feedback,
    typeof req.body.author === 'string' ? req.body.author.slice(0, 100) : role,
    role
  );
  if (!task) return res.status(404).json({ message: 'Task milestone not found.' });
  addTaskComment(req.params.id, {
    id: crypto.randomUUID(),
    author: typeof req.body.author === 'string' ? req.body.author.slice(0, 100) : role,
    role,
    text: feedback,
    createdAt: new Date().toISOString()
  });
  if (!await saveState(next)) return;
  return res.status(201).json({ task });
});

router.patch('/:id/milestones/:weekIndex/feedback/:feedbackId/review', async (req, res, next) => {
  if (req.body?.role !== 'Coordinator') {
    return res.status(403).json({ message: 'Only a coordinator can mark guide feedback as reviewed.' });
  }
  const task = reviewTaskMilestoneFeedback(
    req.params.id,
    Number(req.params.weekIndex),
    req.params.feedbackId
  );
  if (!task) return res.status(404).json({ message: 'Guide feedback not found for this week.' });
  if (!await saveState(next)) return;
  return res.json({ task });
});

router.patch('/:id/review', async (req, res, next) => {
  const { reviewerRole, decision } = req.body || {};
  const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : '';
  if (feedback.length > 2000) {
    return res.status(400).json({ message: 'Review feedback must be 2,000 characters or fewer.' });
  }

  let suggestionWeekIndex = -1;
  if (reviewerRole === 'Guide' && decision === 'Verified with suggested changes' && feedback) {
    const task = getTaskById(req.params.id);
    if (task) {
      const milestoneWeek = Number(task.milestoneWeek || task.title?.match(/^Week\s+(\d+)/i)?.[1]);
      suggestionWeekIndex = task.milestones?.findIndex((milestone) => Number(milestone.week) === milestoneWeek) ?? -1;
      if (suggestionWeekIndex < 0 && task.milestones?.length === 1) suggestionWeekIndex = 0;
      if (suggestionWeekIndex < 0) {
        return res.status(409).json({ message: 'Could not match the suggested changes to a milestone week.' });
      }
    }
  }

  const result = reviewTask(req.params.id, reviewerRole, decision);
  if (result.error) {
    return res.status(result.error === 'Task not found.' ? 404 : 409).json({ message: result.error });
  }

  if (feedback) {
    if (suggestionWeekIndex >= 0) {
      addTaskMilestoneFeedback(
        req.params.id,
        suggestionWeekIndex,
        feedback,
        typeof req.body.reviewerName === 'string' ? req.body.reviewerName.slice(0, 100) : reviewerRole,
        reviewerRole
      );
    }
    addTaskComment(req.params.id, {
      id: crypto.randomUUID(),
      author: typeof req.body.reviewerName === 'string' ? req.body.reviewerName.slice(0, 100) : reviewerRole,
      role: reviewerRole,
      text: feedback,
      createdAt: new Date().toISOString()
    });
  }

  if (!await saveState(next)) return;
  return res.json({ task: getTaskById(req.params.id) });
});

router.put('/:id', async (req, res, next) => {
  const allowedFields = ['title', 'description', 'assignee', 'team', 'priority', 'dueDate'];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowedFields.includes(key)));
  if (updates.dueDate !== undefined && isPublicHolidayDate(updates.dueDate)) {
    updates.dueDate = moveDeadlineOffHoliday(new Date(`${updates.dueDate}T00:00:00Z`))
      .toISOString()
      .slice(0, 10);
  }
  if (updates.priority && !allowedPriorities.includes(updates.priority)) {
    return res.status(400).json({ message: 'Choose a valid task priority.' });
  }
  if (updates.title !== undefined && (typeof updates.title !== 'string' || !updates.title.trim())) {
    return res.status(400).json({ message: 'A task title cannot be empty.' });
  }

  const actorRole = typeof req.body?.actorRole === 'string' ? req.body.actorRole : '';
  const updated = updateTask(req.params.id, updates, actorRole);

  if (!updated) {
    return res.status(404).json({ message: 'Task not found' });
  }

  if (updates.dueDate !== undefined) {
    rescheduleFollowingWeeklyDeadlines(updated);
  }

  if (!await saveState(next)) return;
  res.json({ task: updated });
});

router.post('/:id/comments', async (req, res, next) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 2000) {
    return res.status(400).json({ message: 'Feedback must contain 1 to 2,000 characters.' });
  }
  const comment = {
    id: crypto.randomUUID(),
    author: typeof req.body.author === 'string' && req.body.author.trim() ? req.body.author.trim().slice(0, 100) : 'TaskFlow member',
    role: typeof req.body.role === 'string' ? req.body.role.slice(0, 30) : '',
    text,
    createdAt: new Date().toISOString()
  };
  const updated = addTaskComment(req.params.id, comment);
  if (!updated) return res.status(404).json({ message: 'Task not found' });
  if (!await saveState(next)) return;
  return res.status(201).json({ task: updated, comment });
});

router.post('/:id/attachments', async (req, res, next) => {
  const task = getTaskById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const { name, data, uploadedBy, uploadedByRole } = req.body || {};
  if (typeof name !== 'string' || typeof data !== 'string') {
    return res.status(400).json({ message: 'A file name and base64 data are required.' });
  }
  if (uploadedByRole !== 'Student') {
    return res.status(403).json({ message: 'Only students can upload documents.' });
  }
  const match = /^data:(application\/pdf|image\/png|image\/jpeg|text\/plain);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) {
    return res.status(400).json({ message: 'Upload a PDF, PNG, JPEG, or plain-text file.' });
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    return res.status(413).json({ message: 'Attachments must be smaller than 5 MB.' });
  }
  const fileType = fileTypes[match[1]];
  if (!fileType.signature(buffer)) {
    return res.status(400).json({ message: 'The uploaded file does not match its declared type.' });
  }

  try {
    const id = crypto.randomUUID();
    const attachment = {
      id,
      name: path.basename(name).slice(0, 160),
      url: `/uploads/${id}${fileType.extension}`,
      contentType: match[1],
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: typeof uploadedBy === 'string' ? uploadedBy.trim().slice(0, 100) : 'Guide',
      uploadedByRole: typeof uploadedByRole === 'string' && ['Guide', 'Coordinator', 'Student'].includes(uploadedByRole)
        ? uploadedByRole
        : 'Guide'
    };
    await TaskAttachment.create({ ...attachment, taskId: task.id, data: buffer });
    const updated = addTaskAttachment(req.params.id, attachment);
    if (!await saveState(next)) return;
    return res.status(201).json({ task: updated, attachment });
  } catch (error) {
    console.error('Failed to save task attachment.', error);
    return res.status(500).json({ message: 'Failed to save the attachment.' });
  }
});

router.delete('/:id', async (req, res, next) => {
  const deleted = deleteTask(req.params.id);

  if (!deleted) {
    return res.status(404).json({ message: 'Task not found' });
  }

  if (!await saveState(next)) return;
  res.json({ message: 'Task deleted successfully' });
});

module.exports = router;
