const express = require('express');
const {
  addMessage,
  findUserByEmail,
  getMessages,
  getTeamById,
  getTeamMessages,
  getProjectById,
  getTeams,
  persistDashboardState
} = require('../data/mockData');

const router = express.Router();

router.get('/', (req, res) => {
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : '';
  if (teamId) {
    const team = getTeamById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    const user = findUserByEmail(email);
    const isTeamStudent = req.query.role === 'Student'
      && user?.role === 'Student'
      && team.studentEmails.some((studentEmail) => studentEmail.toLowerCase() === email);
    if (!isTeamStudent) return res.status(403).json({ message: 'Only students on this team can view its chat.' });
    return res.json({ messages: getTeamMessages(teamId) });
  }

  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
  if (!projectId) return res.status(400).json({ message: 'Choose a project to load its conversation.' });
  if (!getProjectById(projectId)) return res.status(404).json({ message: 'Project not found.' });
  return res.json({ messages: getMessages(projectId) });
});

router.post('/', async (req, res, next) => {
  const { projectId, senderRole } = req.body || {};
  const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : '';
  const senderEmail = typeof req.body?.senderEmail === 'string' ? req.body.senderEmail.trim().toLowerCase() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

  if (teamId) {
    const team = getTeamById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    const sender = findUserByEmail(senderEmail);
    const isTeamStudent = senderRole === 'Student'
      && sender?.role === 'Student'
      && team.studentEmails.some((studentEmail) => studentEmail.toLowerCase() === senderEmail);
    if (!isTeamStudent) return res.status(403).json({ message: 'Only students on this team can send messages.' });
    if (!text || text.length > 2000) {
      return res.status(400).json({ message: 'Messages must contain 1 to 2,000 characters.' });
    }

    const message = addMessage({
      projectId: team.projectId,
      teamId,
      conversationType: 'StudentTeam',
      senderEmail,
      senderName: sender.name,
      senderRole: 'Student',
      receiverRole: 'Student',
      text
    });
    try {
      await persistDashboardState();
    } catch (error) {
      return next(error);
    }
    return res.status(201).json({ message });
  }

  if (!projectId || !getProjectById(projectId)) {
    return res.status(400).json({ message: 'Choose a valid project for this message.' });
  }
  if (!['Guide', 'Coordinator'].includes(senderRole)) {
    return res.status(403).json({ message: 'Only guides and coordinators can use this conversation.' });
  }
  if (!text || text.length > 2000) {
    return res.status(400).json({ message: 'Messages must contain 1 to 2,000 characters.' });
  }

  const sender = findUserByEmail(senderEmail);
  if (!sender || sender.role !== senderRole) {
    return res.status(403).json({ message: 'The sender account could not be verified.' });
  }
  if (senderRole === 'Guide' && !getTeams().some((team) => team.projectId === projectId && team.guideEmail === senderEmail)) {
    return res.status(403).json({ message: 'You are not assigned as a guide on this project.' });
  }

  const message = addMessage({
    projectId,
    senderEmail,
    senderName: sender.name,
    senderRole,
    receiverRole: senderRole === 'Guide' ? 'Coordinator' : 'Guide',
    text
  });
  try {
    await persistDashboardState();
  } catch (error) {
    return next(error);
  }
  return res.status(201).json({ message });
});

module.exports = router;