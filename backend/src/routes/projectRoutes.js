const express = require('express');
const User = require('../models/User');
const { createProjectFromPdf } = require('../controllers/projectPdfController');
const {
  getProjects,
  getProjectById,
  getTeams,
  getTasks,
  getUsers,
  findUserByEmail,
  addProject,
  addProjectTeam,
  validateProjectTeam,
  createProjectTeamsAndTasks,
  resetProjectMilestones,
  syncUserAccount,
  persistDashboardState
} = require('../data/mockData');

const router = express.Router();

const parseProjectUpload = express.raw({
  type: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  limit: '5mb'
});

router.post(
  ['/import-pdf', '/import-file'],
  (req, res, next) => parseProjectUpload(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ message: 'The uploaded file must be 5 MB or smaller.' });
    }
    return next(error);
  }),
  createProjectFromPdf
);

const safeUser = (user) => user && ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

function serializeProject(project) {
  const tasks = getTasks().filter((task) => task.projectId === project.id);
  const teams = getTeams()
    .filter((team) => team.projectId === project.id)
    .map((team) => {
      const teamTasks = tasks.filter((task) => task.teamId === team.id);
      return {
        ...team,
        guide: safeUser(findUserByEmail(team.guideEmail)),
        students: team.studentEmails.map((email) => safeUser(findUserByEmail(email))).filter(Boolean),
        stats: {
          total: teamTasks.length,
          completed: teamTasks.filter((task) => task.status === 'Completed').length,
          atRisk: teamTasks.filter((task) => task.status === 'At Risk').length,
          progress: teamTasks.length
            ? Math.round(teamTasks.reduce((total, task) => total + (task.progress || 0), 0) / teamTasks.length)
            : 0
        }
      };
    });
  const completed = tasks.filter((task) => task.status === 'Completed').length;
  const progress = tasks.length
    ? Math.round(tasks.reduce((total, task) => total + (task.progress || 0), 0) / tasks.length)
    : 0;
  return {
    ...project,
    teams,
    stats: {
      total: tasks.length,
      completed,
      inProgress: tasks.filter((task) => task.status === 'In Progress').length,
      atRisk: tasks.filter((task) => task.status === 'At Risk').length,
      overdue: tasks.filter((task) => task.status !== 'Completed' && new Date(`${task.dueDate}T23:59:59`) < new Date()).length,
      progress
    }
  };
}

router.get('/', (req, res) => {
  res.json({ projects: getProjects().map(serializeProject) });
});

router.post('/:id/reset-milestones', async (req, res, next) => {
  if (req.body?.role !== 'Coordinator') {
    return res.status(403).json({ message: 'Only a coordinator can reset project milestones.' });
  }
  const reset = resetProjectMilestones(req.params.id);
  if (reset.error) return res.status(404).json({ message: reset.error });
  try {
    await persistDashboardState();
    return res.json(reset);
  } catch (error) {
    return next(error);
  }
});

router.get('/assignable-users', async (req, res, next) => {
  try {
    const registeredUsers = await User.find({ role: { $in: ['Guide', 'Student'] } }).select('name email role').lean();
    registeredUsers.forEach((user) => syncUserAccount(user));
    const assignedStudents = new Set(getTeams().flatMap((team) => team.studentEmails));
    const users = getUsers();
    return res.json({
      guides: users.filter((user) => user.role === 'Guide').map(safeUser),
      students: users.filter((user) => user.role === 'Student' && !assignedStudents.has(user.email.toLowerCase())).map(safeUser)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  return res.json({
    project: serializeProject(project),
    tasks: getTasks().filter((task) => task.projectId === project.id)
  });
});

router.post('/', async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const guideEmail = typeof req.body?.guideEmail === 'string' ? req.body.guideEmail.trim().toLowerCase() : '';
  const studentEmails = Array.isArray(req.body?.studentEmails) ? req.body.studentEmails : [];
  const hasAssignment = Boolean(guideEmail || req.body?.studentEmails !== undefined);
  if (!name || name.length > 120 || !description || description.length > 1000) {
    return res.status(400).json({ message: 'Enter a project name (up to 120 characters) and description (up to 1,000 characters).' });
  }
  if (hasAssignment) {
    const assignmentError = validateProjectTeam({ guideEmail, studentEmails });
    if (assignmentError) return res.status(400).json({ message: assignmentError });
  }

  const project = addProject({ name, description });
  if (hasAssignment) {
    const assignment = addProjectTeam({ projectId: project.id, guideEmail, studentEmails });
    if (assignment.error) return res.status(400).json({ message: assignment.error });
  }
  try {
    await persistDashboardState();
  } catch (error) {
    return next(error);
  }
  return res.status(201).json({ project: serializeProject(project) });
});

router.post('/:id/agent-setup', async (req, res, next) => {
  try {
    const registeredUsers = await User.find({ role: { $in: ['Guide', 'Student'] } }).select('name email role').lean();
    registeredUsers.forEach((user) => syncUserAccount({ id: user._id, name: user.name, email: user.email, role: user.role }));
    const setup = createProjectTeamsAndTasks(req.params.id);
    if (setup.error) return res.status(setup.error === 'Project not found.' ? 404 : 409).json({ message: setup.error });
    await persistDashboardState();
    return res.status(201).json(setup);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
