const express = require('express');
const {
  getAiSummary,
  getNotifications,
  createAgentPlan,
  persistDashboardState,
  clearNotifications
} = require('../data/mockData');

const router = express.Router();

router.get('/summary', (req, res) => {
  const scope = {
    projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
    teamId: typeof req.query.teamId === 'string' ? req.query.teamId : undefined,
    role: typeof req.query.role === 'string' ? req.query.role : undefined,
    email: typeof req.query.email === 'string' ? req.query.email : undefined
  };
  res.json({
    summary: getAiSummary(scope),
    notifications: getNotifications(scope)
  });
});

router.delete('/notifications', async (req, res, next) => {
  clearNotifications();
  try {
    await persistDashboardState();
    return res.json({ notifications: [] });
  } catch (error) {
    return next(error);
  }
});

router.post('/agent', async (req, res, next) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    return res.status(400).json({ message: 'Describe what you want the task agent to analyze.' });
  }
  if (prompt.length > 500) {
    return res.status(400).json({ message: 'The agent request must be 500 characters or fewer.' });
  }
  const plan = createAgentPlan(prompt, {
    projectId: typeof req.body.projectId === 'string' ? req.body.projectId : undefined,
    teamId: typeof req.body.teamId === 'string' ? req.body.teamId : undefined,
    role: typeof req.body.role === 'string' ? req.body.role : undefined,
    email: typeof req.body.email === 'string' ? req.body.email : undefined
  });
  return res.status(200).json({ plan, tasks: [] });
});

module.exports = router;
