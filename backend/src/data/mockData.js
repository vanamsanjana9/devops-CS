const crypto = require('crypto');
const mongoose = require('mongoose');
const DashboardState = require('../models/DashboardState');
const User = require('../models/User');

function createTaskMilestones(completed = false) {
  const weeks = [
    { week: 1, heading: 'Abstract', items: ['Abstract Submission'] },
    { week: 2, heading: 'Problem Analysis', items: ['Understanding the Problem and Problem Definition', 'Problem Scope', 'Framing objectives'] },
    { week: 3, heading: 'Literature Survey', items: ['Base paper submission', 'Summary of existing systems'] },
    { week: 4, heading: 'Proposed system', items: ['Proposed system'] },
    { week: 5, heading: 'Requirements', items: ['Module identification', 'Methodology and Data Collection', 'Dataset Description'] },
    { week: 6, heading: 'Requirements', items: ['System Architecture', 'Requirement Specification document (Functional & Non-functional)', 'Software & Hardware specification'] },
    { week: 7, heading: 'Design', items: ['PRC-I Presentation Review', 'ER diagram', 'Use case diagram', 'Class diagram'] },
    { week: 8, heading: 'Design', items: ['Interactive Diagrams', 'Activity Diagram', 'State Chart Diagram', 'Submission of Design document'] },
    { week: 9, heading: 'Implementation', items: ['Coding'] },
    { week: 10, heading: 'Implementation', items: ['Coding'] },
    { week: 11, heading: 'Implementation', items: ['Coding'] },
    { week: 12, heading: 'Implementation', items: ['Coding', 'PPT & Paper draft reviewed by guide'] },
    { week: 13, heading: 'Implementation', items: ['PRC-II Presentation Review'] },
    { week: 14, heading: 'Documentation', items: ['Preparation and submission of paper', 'Submission of Phase-1 report'] }
  ];
  return weeks.map((week) => ({
    ...week,
    completed,
    feedbacks: []
  }));
}

function getWeeklyMilestone(weekNumber) {
  return createTaskMilestones().find((milestone) => milestone.week === weekNumber) || null;
}

function getEasterSunday(year) {
  const century = Math.floor(year / 100);
  const yearOfCentury = year % 100;
  const yearCycle = year % 19;
  const leapCentury = Math.floor(century / 4);
  const centuryRemainder = century % 4;
  const lunarCorrection = Math.floor((century + 8) / 25);
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3);
  const epact = (19 * yearCycle + century - leapCentury - solarCorrection + 15) % 30;
  const leapYears = Math.floor(yearOfCentury / 4);
  const yearRemainder = yearOfCentury % 4;
  const weekdayCorrection = (32 + 2 * centuryRemainder + 2 * leapYears - epact - yearRemainder) % 7;
  const dateCorrection = Math.floor((yearCycle + 11 * epact + 22 * weekdayCorrection) / 451);
  const easterMonth = Math.floor((epact + weekdayCorrection - 7 * dateCorrection + 114) / 31);
  const easterDay = ((epact + weekdayCorrection - 7 * dateCorrection + 114) % 31) + 1;
  return new Date(Date.UTC(year, easterMonth - 1, easterDay));
}

function getHolidayDateKeys(year) {
  if (year === 2026) {
    return new Set([
      '2026-01-01', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-26',
      '2026-02-15', '2026-03-03', '2026-03-19', '2026-03-21', '2026-03-22',
      '2026-03-27', '2026-03-31', '2026-04-03', '2026-04-05', '2026-04-14',
      '2026-05-01', '2026-05-27', '2026-06-26', '2026-07-16', '2026-08-10',
      '2026-08-15', '2026-08-26', '2026-08-28', '2026-09-04', '2026-09-14',
      '2026-10-02', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21',
      '2026-10-26', '2026-11-08', '2026-11-24', '2026-12-24', '2026-12-25',
      '2026-12-26'
    ]);
  }

  const easterSunday = getEasterSunday(year);
  const goodFriday = new Date(easterSunday);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  return new Set([
    `${year}-01-01`,
    `${year}-01-26`,
    goodFriday.toISOString().slice(0, 10),
    `${year}-08-15`,
    `${year}-10-02`,
    `${year}-12-25`
  ]);
}

function isPublicHolidayDate(dateKey) {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) return false;
  return getHolidayDateKeys(date.getUTCFullYear()).has(dateKey);
}

function moveDeadlineOffHoliday(date) {
  const adjustedDate = new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
  while (isPublicHolidayDate(adjustedDate.toISOString().slice(0, 10))) {
    adjustedDate.setUTCDate(adjustedDate.getUTCDate() + 1);
  }
  return adjustedDate;
}

const state = {
  tasks: [],
  users: [],
  projects: [],
  teams: [],
  messages: [],
  notifications: []
};

async function initializeDashboardState() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB must be connected before dashboard data is initialized.');
  }
  const saved = await DashboardState.findOne({ key: 'primary' }).lean();
  if (saved) {
    state.tasks = saved.tasks || [];
    state.projects = saved.projects || [];
    state.teams = saved.teams || [];
    state.messages = saved.messages || [];
    state.notifications = saved.notifications || [];
  }
  const databaseUsers = await User.find().lean();
  state.users = databaseUsers.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role
  }));
  ensureWeeklyTaskQueues();
  await persistDashboardState();
}

async function refreshDashboardState() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is unavailable; dashboard data cannot be loaded.');
  }
  const [saved, databaseUsers] = await Promise.all([
    DashboardState.findOne({ key: 'primary' }).lean(),
    User.find().lean()
  ]);
  if (!saved) throw new Error('Dashboard data has not been initialized in MongoDB.');
  state.tasks = saved.tasks || [];
  state.projects = saved.projects || [];
  state.teams = saved.teams || [];
  state.messages = saved.messages || [];
  state.notifications = saved.notifications || [];
  state.users = databaseUsers.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role
  }));
  return state;
}

async function persistDashboardState() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is unavailable; dashboard changes cannot be saved.');
  }
  await DashboardState.updateOne({ key: 'primary' }, {
    $set: {
      tasks: state.tasks,
      projects: state.projects,
      teams: state.teams,
      messages: state.messages,
      notifications: state.notifications
    }
  }, { upsert: true });
}

function clearNotifications() {
  state.notifications.length = 0;
  return state.notifications;
}

function ensureWeeklyTaskQueues(teams = state.teams) {
  const generated = [];
  teams.forEach((team) => {
    for (let weekNumber = 1; weekNumber <= 14; weekNumber += 1) {
      const existingTask = state.tasks.find((task) => task.teamId === team.id && task.milestoneWeek === weekNumber);
      if (existingTask) {
        assignTaskToTeam(existingTask, team);
        if (isPublicHolidayDate(existingTask.dueDate)) {
          existingTask.dueDate = moveDeadlineOffHoliday(new Date(`${existingTask.dueDate}T00:00:00Z`)).toISOString().slice(0, 10);
        }
        existingTask.assignmentStatus ||= existingTask.assigneeEmail ? 'Assigned' : 'Queued';
        existingTask.generatedBy ||= 'AI Weekly Milestone Agent';
        continue;
      }
      const milestone = getWeeklyMilestone(weekNumber);
      const previousTask = state.tasks
        .filter((task) => task.teamId === team.id && task.milestoneWeek < weekNumber)
        .sort((left, right) => right.milestoneWeek - left.milestoneWeek)[0];
      const dueDate = new Date(previousTask?.dueDate || new Date().toISOString().slice(0, 10));
      dueDate.setDate(dueDate.getDate() + 7);
      const adjustedDueDate = moveDeadlineOffHoliday(dueDate);
      const assignedEmail = weekNumber === 1 ? team.studentEmails[0] : '';
      const assignee = assignedEmail ? findUserByEmail(assignedEmail) : null;
      const task = addTask({
        id: `TASK-${crypto.randomUUID()}`,
        title: `Week ${weekNumber}: ${milestone.heading}`,
        description: milestone.items.join('; '),
        assignee: assignee?.name || 'Unassigned',
        team: team.name,
        projectId: team.projectId,
        teamId: team.id,
        ...(assignedEmail ? { assigneeEmail: assignedEmail } : {}),
        milestoneWeek: weekNumber,
        milestones: [{ ...milestone, completed: false }],
        generatedBy: 'AI Weekly Milestone Agent',
        assignmentStatus: assignedEmail ? 'Assigned' : 'Queued',
        priority: weekNumber === 1 ? 'High' : 'Medium',
        status: assignedEmail ? 'To Do' : 'Queued',
        progress: 0,
        dueDate: adjustedDueDate.toISOString().slice(0, 10),
        createdAt: new Date().toISOString().slice(0, 10),
        comments: [],
        attachments: []
      });
      assignTaskToTeam(task, team);
      generated.push(task);
    }
    reconcileWeeklyTaskQueue(team);
  });
  return generated;
}

function reconcileWeeklyTaskQueue(team) {
  const teamTasks = state.tasks
    .filter((task) => task.teamId === team.id)
    .sort((left, right) => left.milestoneWeek - right.milestoneWeek);
  const nextTask = teamTasks.find((task) => task.coordinatorReviewStatus !== 'Reviewed' && task.status !== 'Completed');
  if (!nextTask) return;

  teamTasks.forEach((task) => assignTaskToTeam(task, team));
  Object.assign(nextTask, {
    assignmentStatus: 'Assigned',
    status: nextTask.status === 'Queued' ? 'To Do' : nextTask.status
  });

  teamTasks.filter((task) => task.milestoneWeek > nextTask.milestoneWeek).forEach((task) => {
    const hasStudentWork = task.submittedAt
      || task.attachments?.some((attachment) => attachment.uploadedByRole === 'Student');
    if (hasStudentWork || task.status === 'Completed' || task.coordinatorReviewStatus === 'Reviewed') return;
    task.assignmentStatus = 'Queued';
    task.status = 'Queued';
    delete task.sourceTaskId;
    delete task.assignedAt;
  });
}
function getTasks() {
  state.tasks.forEach((task) => {
    syncTaskReviewState(task);
  });
  return state.tasks;
}

function syncTaskReviewState(task) {
  if (!task.guideReviewStatus) {
    task.guideReviewStatus = ['Review', 'Completed'].includes(task.status) ? 'Pending' : 'Not Submitted';
  }
  if (!task.coordinatorReviewStatus) {
    task.coordinatorReviewStatus = task.guideReviewStatus === 'Verified' ? 'Pending' : 'Not Submitted';
  } else if (!['Verified', 'Changes updated'].includes(task.guideReviewStatus)
    && task.coordinatorReviewStatus === 'Pending') {
    task.coordinatorReviewStatus = 'Not Submitted';
  }
}

function addTaskMilestoneFeedback(taskId, weekIndex, text, author, role) {
  const task = getTaskById(taskId);
  const week = task?.milestones?.[weekIndex];
  if (!week || !text || !['Guide', 'Coordinator'].includes(role)) return null;
  week.feedbacks = [...(week.feedbacks || []), {
    id: crypto.randomUUID(),
    text,
    author,
    role,
    createdAt: new Date().toISOString()
  }];
  state.notifications.unshift(`${role} left feedback for week ${week.week} of "${task.title}".`);
  return task;
}

function reviewTaskMilestoneFeedback(taskId, weekIndex, feedbackId) {
  const task = getTaskById(taskId);
  const feedback = task?.milestones?.[weekIndex]?.feedbacks?.find((entry) => entry.id === feedbackId);
  if (!feedback || feedback.role !== 'Guide') return null;
  feedback.coordinatorReviewed = true;
  feedback.coordinatorReviewedAt ||= new Date().toISOString();
  return task;
}

function getTaskById(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

function getProjects() {
  return state.projects;
}

function getUsers() {
  return state.users;
}

function getProjectById(id) {
  return state.projects.find((project) => project.id === id) || null;
}

function getTeams() {
  return state.teams;
}

function getTeamById(id) {
  return state.teams.find((team) => team.id === id) || null;
}

function validateProjectTeam({ guideEmail, studentEmails } = {}) {
  const normalizedGuideEmail = String(guideEmail || '').trim().toLowerCase();
  const normalizedStudentEmails = Array.isArray(studentEmails)
    ? studentEmails.map((email) => String(email).trim().toLowerCase())
    : [];
  if (normalizedStudentEmails.length !== 3 || new Set(normalizedStudentEmails).size !== 3) {
    return 'Select exactly three different students for the project team.';
  }

  const guide = findUserByEmail(normalizedGuideEmail);
  if (!guide || guide.role !== 'Guide') return 'Select a valid faculty guide.';

  const students = normalizedStudentEmails.map(findUserByEmail);
  if (students.some((student) => !student || student.role !== 'Student')) {
    return 'Select three valid student accounts.';
  }

  const assignedStudents = new Set(getTeams().flatMap((team) => team.studentEmails));
  if (normalizedStudentEmails.some((email) => assignedStudents.has(email))) {
    return 'One or more selected students are already assigned to a project team.';
  }
  return null;
}

function addProjectTeam({ projectId, guideEmail, studentEmails }) {
  const project = getProjectById(projectId);
  if (!project) return { error: 'Project not found.' };
  const validationError = validateProjectTeam({ guideEmail, studentEmails });
  if (validationError) return { error: validationError };

  const guide = findUserByEmail(guideEmail);
  const team = {
    id: `TEAM-${crypto.randomUUID()}`,
    projectId,
    name: `${project.name} Team`,
    guideEmail: guide.email,
    studentEmails: studentEmails.map((email) => String(email).trim().toLowerCase()),
    createdAt: new Date().toISOString().slice(0, 10)
  };
  state.teams.push(team);
  project.status = 'In Progress';
  ensureWeeklyTaskQueues([team]);
  state.notifications.unshift(`${guide.name} and three students were assigned to "${project.name}".`);
  return { team };
}

function getTeamForGuide(email) {
  return state.teams.find((team) => team.guideEmail === String(email).toLowerCase()) || null;
}

function addProject({ name, description }) {
  const project = {
    id: `PROJECT-${crypto.randomUUID()}`,
    name: name.trim(),
    description: description.trim(),
    status: 'Planning',
    createdAt: new Date().toISOString().slice(0, 10)
  };
  state.projects.unshift(project);
  state.notifications.unshift(`Project "${project.name}" was created and is ready for team setup.`);
  return project;
}

function createProjectTeamsAndTasks(projectId) {
  const project = getProjectById(projectId);
  if (!project) return { error: 'Project not found.' };
  if (state.teams.some((team) => team.projectId === projectId)) {
    return { error: 'This project already has a team. Each team setup can only run once.' };
  }

  const assignedStudents = new Set(state.teams.flatMap((team) => team.studentEmails));
  const availableStudents = state.users.filter((user) => user.role === 'Student' && !assignedStudents.has(user.email));
  const availableGuides = state.users.filter((user) => user.role === 'Guide');
  const teamCount = Math.floor(availableStudents.length / 3);
  if (!teamCount || !availableGuides.length) {
    return {
      error: `Team setup needs at least 3 unassigned students and 1 faculty guide. Available: ${availableStudents.length} student(s), ${availableGuides.length} guide(s).`
    };
  }

  const teams = [];
  const tasks = [];
  const today = new Date();
  const taskTemplates = [
    { title: 'Week 1: Abstract submission', week: 1, priority: 'High', days: 7 }
  ];

  for (let index = 0; index < teamCount; index += 1) {
    const members = availableStudents.slice(index * 3, index * 3 + 3);
    const guide = availableGuides[index % availableGuides.length];
    const team = {
      id: `TEAM-${crypto.randomUUID()}`,
      projectId,
      name: `${project.name} Team ${index + 1}`,
      guideEmail: guide.email,
      studentEmails: members.map((student) => student.email),
      createdAt: today.toISOString().slice(0, 10)
    };
    state.teams.push(team);
    teams.push(team);
    const firstStudent = members[0];
    const template = taskTemplates[0];
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + template.days);
      const adjustedDueDate = moveDeadlineOffHoliday(dueDate);
      tasks.push(addTask({
        id: `TASK-${crypto.randomUUID()}`,
        projectId,
        teamId: team.id,
        assigneeEmail: firstStudent.email,
        title: `${template.title}: ${project.name}`,
        description: `Agent-generated kickoff task for ${team.name}. Project goal: ${project.description}`,
        assignee: firstStudent.name,
        team: team.name,
        priority: template.priority,
        status: 'To Do',
        progress: 0,
        dueDate: adjustedDueDate.toISOString().slice(0, 10),
        createdAt: today.toISOString().slice(0, 10),
        milestoneWeek: template.week,
        milestones: [{ ...createTaskMilestones().find((week) => week.week === template.week), completed: false }],
        generatedBy: 'AI Weekly Milestone Agent',
        assignmentStatus: 'Assigned',
        comments: [],
        attachments: []
      }));
    tasks.push(...ensureWeeklyTaskQueues([team]));
    state.notifications.unshift(`The AI agent assigned ${guide.name} and ${members.length} students to "${team.name}".`);
  }
  project.status = 'In Progress';
  return { teams, tasks };
}

function addTask(task) {
  if (!task.milestones?.length) task.milestones = createTaskMilestones(task.status === 'Completed');
  task.assignmentStatus ||= task.assigneeEmail ? 'Assigned' : 'Queued';
  if (task.status === 'Completed') task.milestones.forEach((week) => { week.completed = true; });
  task.guideReviewStatus = task.status === 'Completed' || task.status === 'Review' ? 'Pending' : 'Not Submitted';
  task.coordinatorReviewStatus = 'Not Submitted';
  if (task.status === 'Completed') task.progress = 100;
  state.tasks.unshift(task);
  if (task.assignee && task.assignee !== 'Unassigned') {
    state.notifications.unshift(`"${task.title}" was assigned to ${task.assignee}.`);
  }
  return task;
}

function updateTask(id, updatedTask, actorRole) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index === -1) return null;
  const previousStatus = state.tasks[index].status;
  const previousAssignee = state.tasks[index].assignee;
  state.tasks[index] = { ...state.tasks[index], ...updatedTask };
  if (actorRole === 'Student' && updatedTask.status && updatedTask.status !== previousStatus) {
    state.tasks[index].guideReviewStatus = ['Review', 'Completed'].includes(updatedTask.status) ? 'Pending' : 'Not Submitted';
    state.tasks[index].coordinatorReviewStatus = 'Not Submitted';
  }
  if (updatedTask.status === 'Completed') {
    state.tasks[index].milestones.forEach((week) => { week.completed = true; });
  }
  if (updatedTask.assignee && updatedTask.assignee !== previousAssignee) {
    state.notifications.unshift(`"${state.tasks[index].title}" was assigned to ${updatedTask.assignee}.`);
  }
  return state.tasks[index];
}

function rescheduleFollowingWeeklyDeadlines(task) {
  if (!task.teamId || !Number.isInteger(Number(task.milestoneWeek)) || !task.dueDate) return [];

  let previousDeadline = new Date(`${task.dueDate}T00:00:00Z`);
  const followingTasks = state.tasks
    .filter((candidate) => candidate.teamId === task.teamId
      && Number(candidate.milestoneWeek) > Number(task.milestoneWeek))
    .sort((left, right) => Number(left.milestoneWeek) - Number(right.milestoneWeek));

  followingTasks.forEach((followingTask) => {
    const nextDeadline = new Date(previousDeadline);
    nextDeadline.setUTCDate(nextDeadline.getUTCDate() + 7);
    followingTask.dueDate = moveDeadlineOffHoliday(nextDeadline).toISOString().slice(0, 10);
    previousDeadline = new Date(`${followingTask.dueDate}T00:00:00Z`);
  });

  return followingTasks;
}

function submitTask(id, studentEmail) {
  const task = getTaskById(id);
  if (!task || task.assignmentStatus === 'Queued' || task.status === 'Completed'
    || !isTaskAssignedToStudent(task, studentEmail)) return null;
  if (task.guideReviewStatus === 'Pending' || task.coordinatorReviewStatus === 'Pending') return null;
  task.status = 'Review';
  task.guideReviewStatus = 'Pending';
  task.coordinatorReviewStatus = 'Not Submitted';
  task.submittedAt = new Date().toISOString();
  state.notifications.unshift(`Student submitted "${task.title}" for guide review.`);
  return task;
}

function reviewTask(id, reviewerRole, decision) {
  const task = getTaskById(id);
  if (!task) return { error: 'Task not found.' };
  syncTaskReviewState(task);

  if (reviewerRole === 'Guide') {
    if (!['Pending', 'Verified with suggested changes', 'Changes updated'].includes(task.guideReviewStatus)
      || !['Verified', 'Verified with suggested changes', 'Changes updated'].includes(decision)) {
      return { error: 'This task is not waiting for guide verification.' };
    }
    task.guideReviewStatus = decision;
    task.coordinatorReviewStatus = ['Verified', 'Changes updated'].includes(decision) ? 'Pending' : 'Not Submitted';
    if (decision === 'Verified') {
      task.progress = 100;
      task.status = 'Review';
    } else if (decision === 'Verified with suggested changes') {
      task.progress = Math.max(task.progress || 0, 75);
      task.status = 'Review';
    } else {
      task.status = 'Review';
      task.progress = 100;
      const milestoneWeek = Number(task.milestoneWeek || task.title.match(/^Week\s+(\d+)/i)?.[1]);
      const currentMilestone = task.milestones?.find((milestone) => Number(milestone.week) === milestoneWeek)
        || (task.milestones?.length === 1 ? task.milestones[0] : null);
      if (currentMilestone) {
        currentMilestone.completed = true;
        currentMilestone.updatedBy = 'Guide';
      }
    }
    task.guideReviewedAt = new Date().toISOString();
  } else if (reviewerRole === 'Coordinator') {
    if (!['Verified', 'Changes updated'].includes(task.guideReviewStatus)
      || task.coordinatorReviewStatus !== 'Pending' || decision !== 'Reviewed') {
      return { error: 'This task is not waiting for coordinator review.' };
    }
    task.coordinatorReviewStatus = 'Reviewed';
    task.progress = 100;
    task.status = 'Completed';
    task.milestones.forEach((milestone) => {
      milestone.completed = true;
      milestone.updatedBy = 'Coordinator';
    });
    task.coordinatorReviewedAt = new Date().toISOString();
    runWeeklyMilestoneAgent(task);
  } else {
    return { error: 'Only a guide or coordinator can review a task.' };
  }

  state.notifications.unshift(`${reviewerRole} ${decision.toLowerCase()} the update for "${task.title}".`);
  return { task };
}

function resetProjectMilestones(projectId) {
  const project = getProjectById(projectId);
  if (!project) return { error: 'Project not found.' };

  const projectTasks = state.tasks.filter((task) => task.projectId === projectId);
  projectTasks.forEach((task) => {
    task.progress = 0;
    task.status = task.assignmentStatus === 'Queued' ? 'Queued' : 'To Do';
    task.guideReviewStatus = 'Not Submitted';
    task.coordinatorReviewStatus = 'Not Submitted';
    delete task.submittedAt;
    delete task.guideReviewedAt;
    delete task.coordinatorReviewedAt;
    task.milestones = (task.milestones || []).map((milestone) => {
      const resetMilestone = { ...milestone, completed: false };
      delete resetMilestone.updatedBy;
      return resetMilestone;
    });
  });

  state.teams.filter((team) => team.projectId === projectId).forEach((team) => {
    const teamTasks = projectTasks
      .filter((task) => task.teamId === team.id)
      .sort((left, right) => (left.milestoneWeek || 0) - (right.milestoneWeek || 0));
    teamTasks.forEach((task) => assignTaskToTeam(task, team));

    teamTasks.forEach((task, index) => {
      if (index === 0 && task.assigneeEmails?.length) {
        Object.assign(task, { assignmentStatus: 'Assigned', status: 'To Do' });
        return;
      }
      task.assignmentStatus = 'Queued';
      task.status = 'Queued';
      delete task.assignedAt;
    });
  });
  state.notifications.unshift(`Coordinator reset weekly milestones for "${project.name}".`);
  return { projectId, resetCount: projectTasks.length };
}

function runWeeklyMilestoneAgent(task) {
  const nextTask = state.tasks
    .filter((candidate) => candidate.teamId === task.teamId
      && candidate.assignmentStatus === 'Queued'
      && candidate.milestoneWeek > task.milestoneWeek)
    .sort((left, right) => left.milestoneWeek - right.milestoneWeek)[0];
  if (!nextTask) return;
  const team = getTeamById(task.teamId);
  if (!team) return;
  rescheduleFollowingWeeklyDeadlines(task);
  assignTaskToTeam(nextTask, team);
  Object.assign(nextTask, {
    assignmentStatus: 'Assigned',
    status: 'To Do',
    sourceTaskId: task.id,
    assignedAt: new Date().toISOString(),
    generationReason: `Coordinator approved Week ${task.milestoneWeek}; AI assigned the next queued team milestone.`
  });
  state.notifications.unshift(`AI assigned ${nextTask.title} to ${nextTask.assignee}.`);
}

function deleteTask(id) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index === -1) return false;
  state.tasks.splice(index, 1);
  return true;
}

function getTaskStats() {
  const tasks = getTasks();
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === 'Completed').length;
  const inProgress = tasks.filter((task) => task.status === 'In Progress').length;
  const atRisk = tasks.filter((task) => task.status === 'At Risk').length;
  const overdue = tasks.filter((task) => {
    if (task.status === 'Completed') return false;
    return new Date(`${task.dueDate}T00:00:00`) < new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  }).length;

  return {
    total,
    completed,
    inProgress,
    atRisk,
    overdue
  };
}

function getAiSummary({ projectId, teamId, role, email } = {}) {
  const guideTeamIds = role === 'Guide' && email
    ? new Set(getTeams().filter((team) => team.guideEmail === email.toLowerCase()).map((team) => team.id))
    : null;
  const tasks = getTasks().filter((task) =>
    (!projectId || task.projectId === projectId)
      && (!teamId || task.teamId === teamId)
      && (role !== 'Student' || !email || isTaskAssignedToStudent(task, email))
      && (!guideTeamIds || guideTeamIds.has(task.teamId))
  );
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const dueSoon = tasks.filter((task) => {
    if (task.status === 'Completed') return false;
    const due = new Date(`${task.dueDate}T00:00:00`);
    const diffDays = (due - today) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 3;
  }).length;

  const delayed = tasks.filter((task) => {
    if (task.status === 'Completed') return false;
    return new Date(`${task.dueDate}T00:00:00`) < today;
  });

  const flagged = tasks.filter((task) => task.status === 'At Risk' || task.priority === 'High');
  const tasksNeedingAction = tasks.filter((task) => {
    if (task.status === 'Completed') return false;
    const dueDate = new Date(`${task.dueDate}T00:00:00`);
    const daysUntilDue = Math.ceil((dueDate - today) / 86400000);
    return task.status === 'At Risk' || daysUntilDue < 0 || (daysUntilDue <= 3 && task.progress < 60);
  });

  const dueSoonInsight = dueSoon === 0
    ? '0 tasks are due.'
    : dueSoon === 1
      ? '1 task is due within the next 3 days.'
      : `${dueSoon} tasks are due within the next 3 days.`;

  const insights = [
    dueSoonInsight,
    `${delayed.length} task(s) are overdue and need attention.`,
    `${flagged.length} task(s) need review due to workload or risk status.`
  ];

  const waitingForGuide = tasks.filter((task) => task.guideReviewStatus === 'Pending').length;
  const waitingForCoordinator = tasks.filter((task) =>
    task.guideReviewStatus === 'Verified' && task.coordinatorReviewStatus === 'Pending'
  ).length;
  const suggestedActions = role === 'Student'
    ? [
      waitingForGuide ? `${waitingForGuide} update(s) are waiting for guide verification.` : null,
      delayed.length ? 'Contact your guide about overdue work and agree on a revised deadline.' : null,
      tasks.some((task) => task.comments?.some((comment) => ['Guide', 'Coordinator'].includes(comment.role)))
        ? 'Review the latest guide and coordinator feedback on your tasks.'
        : null
    ]
    : role === 'Guide'
      ? [
        waitingForGuide ? `${waitingForGuide} student update(s) need verification.` : null,
        delayed.length ? `${delayed.length} task(s) are overdue; agree recovery deadlines with students.` : null,
        tasksNeedingAction.length ? `${tasksNeedingAction.length} task(s) need a blocker check-in.` : null
      ]
      : role === 'Coordinator'
        ? [
          waitingForCoordinator ? `${waitingForCoordinator} guide-verified update(s) need coordinator review.` : null,
          delayed.length ? `${delayed.length} task(s) are overdue; send teams deadline guidance.` : null,
          tasksNeedingAction.length ? `${tasksNeedingAction.length} task(s) need coordinator attention.` : null
        ]
        : [];
  suggestedActions.splice(0, suggestedActions.length, ...suggestedActions.filter(Boolean));

  return {
    summary: {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => task.status === 'Completed').length,
      atRiskTasks: tasks.filter((task) => task.status === 'At Risk').length,
      dueSoon
    },
    riskLevel: delayed.length > 0 ? 'High' : 'Moderate',
    insights,
    suggestedActions,
    tasksAtRisk: flagged.slice(0, 3)
  };
}

function createAgentPlan(prompt, { projectId, teamId, role, email } = {}) {
  const today = new Date();
  const request = prompt.toLowerCase();
  const guideTeamIds = role === 'Guide' && email
    ? new Set(getTeams().filter((team) => team.guideEmail === email.toLowerCase()).map((team) => team.id))
    : null;
  const activeFollowUpSourceIds = new Set(getTasks()
    .filter((task) => task.sourceTaskId && task.status !== 'Completed')
    .map((task) => task.sourceTaskId));
  const openTasks = getTasks()
    .filter((task) => task.assignmentStatus !== 'Queued')
    .filter((task) => !task.sourceTaskId && !activeFollowUpSourceIds.has(task.id))
    .filter((task) => task.status !== 'Completed')
    .filter((task) => (!projectId || task.projectId === projectId) && (!teamId || task.teamId === teamId))
    .filter((task) => (!guideTeamIds || guideTeamIds.has(task.teamId))
      && (role !== 'Student' || !email || isTaskAssignedToStudent(task, email)))
    .map((task) => {
      const dueDate = new Date(`${task.dueDate}T00:00:00`);
      const daysUntilDue = Math.ceil((dueDate - new Date(`${today.toISOString().slice(0, 10)}T00:00:00`)) / 86400000);
      const nextMilestone = task.milestones?.find((milestone) => !milestone.completed) || null;
      return { ...task, daysUntilDue, nextMilestone };
    })
    .sort((left, right) => left.daysUntilDue - right.daysUntilDue);
  const isProgressRequest = /progress|blocker|blocked/.test(request);
  const isDeadlineRequest = /due|deadline|overdue|schedule/.test(request);
  const isRiskRequest = /risk|urgent|attention|priority/.test(request);
  const isMilestoneRequest = /milestone|weekly|\bweek\b|deliverable|submission/.test(request);
  const candidates = openTasks.filter((task) => {
    if (isProgressRequest) return task.progress < 60 || task.status === 'At Risk';
    if (isDeadlineRequest) return task.daysUntilDue <= 7;
    if (isRiskRequest) return task.status === 'At Risk' || task.daysUntilDue < 0 || task.priority === 'High';
    if (isMilestoneRequest) return Boolean(task.nextMilestone);
    return task.status === 'At Risk' || task.daysUntilDue < 0 || (task.priority === 'High' && task.daysUntilDue <= 3);
  });
  const mayBroadenScope = !isProgressRequest && !isDeadlineRequest && !isRiskRequest && !isMilestoneRequest;
  const selectedTasks = (candidates.length
    ? candidates
    : mayBroadenScope
      ? openTasks.filter((task) => task.daysUntilDue <= 7)
      : []).slice(0, 3);
  const actions = selectedTasks.map((task, index) => {
    const followUpDate = new Date(today);
    followUpDate.setDate(followUpDate.getDate() + index + 1);
    const dueDate = moveDeadlineOffHoliday(followUpDate).toISOString().slice(0, 10);
    const milestone = task.nextMilestone;
    return {
      title: `${isMilestoneRequest && milestone ? `Week ${milestone.week} check-in: ` : 'Follow up: '}${task.title}`,
      description: `Agent recommendation based on "${task.title}" (${task.status}, ${task.progress}% complete, due ${task.dueDate}).${milestone ? ` Next unchecked milestone: Week ${milestone.week}, ${milestone.heading} (${milestone.items.join(', ')}).` : ''} Confirm blockers with ${task.assignee} and agree on the next milestone.`,
      assignee: task.assignee,
      team: task.team,
      priority: task.status === 'At Risk' || task.daysUntilDue < 0 ? 'High' : 'Medium',
      status: 'To Do',
      progress: 0,
      dueDate,
      sourceTaskId: task.id,
      projectId: task.projectId,
      teamId: task.teamId,
      assigneeEmail: task.assigneeEmail,
      rationale: isMilestoneRequest && milestone
        ? `Week ${milestone.week}: ${milestone.heading} is the next unchecked milestone.`
        : task.status === 'At Risk'
        ? 'The task is explicitly marked at risk.'
        : task.daysUntilDue < 0
          ? 'The task is past its due date.'
          : isProgressRequest && task.progress < 60
            ? `Only ${task.progress}% complete, so a blocker check-in is recommended.`
            : isDeadlineRequest
              ? 'The task is due within the next seven days.'
              : task.daysUntilDue <= 7
                ? 'The task is due within the next seven days.'
                : 'The high-priority task is due within three days.'
    };
  });

  return {
    id: crypto.randomUUID(),
    prompt,
    generatedAt: new Date().toISOString(),
    summary: actions.length
      ? `I reviewed ${openTasks.length} open tasks and found ${actions.length} follow-up${actions.length === 1 ? '' : 's'} to consider.`
      : `I reviewed ${openTasks.length} open tasks and found no urgent follow-ups. You can still review the dashboard insights.`,
    actions
  };
}

function addTaskComment(id, comment) {
  const task = getTaskById(id);
  if (!task) return null;
  task.comments = [...(task.comments || []), comment];
  state.notifications.unshift(`${comment.author} added feedback to "${task.title}".`);
  return task;
}

function getMessages(projectId) {
  return state.messages
    .filter((message) => message.projectId === projectId && message.conversationType !== 'StudentTeam')
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function getTeamMessages(teamId) {
  return state.messages
    .filter((message) => message.teamId === teamId && message.conversationType === 'StudentTeam')
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function addMessage(message) {
  const savedMessage = {
    id: crypto.randomUUID(),
    ...message,
    createdAt: new Date().toISOString(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  state.messages.push(savedMessage);
  return savedMessage;
}

function addTaskAttachment(id, attachment) {
  const task = getTaskById(id);
  if (!task) return null;
  task.attachments = [...(task.attachments || []), attachment];
  state.notifications.unshift(`A document was added to "${task.title}".`);
  return task;
}

function getNotifications({ projectId, teamId, role, email } = {}) {
  if (!['Guide', 'Coordinator', 'Student'].includes(role)) return [];
  if (role === 'Student' && !email) return [];

  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const scopedTasks = getTasks()
    .filter((task) => (!projectId || task.projectId === projectId) && (!teamId || task.teamId === teamId))
    .filter((task) => task.status !== 'Completed'
      || (role === 'Guide' && task.guideReviewStatus === 'Pending')
      || (role === 'Coordinator' && task.guideReviewStatus === 'Verified' && task.coordinatorReviewStatus === 'Pending')
      || (role === 'Student' && ['Verified', 'Verified with suggested changes', 'Not Done'].includes(task.guideReviewStatus))
      || (role === 'Student' && task.coordinatorReviewStatus === 'Reviewed'));
  const overdue = [];
  const dueSoon = [];
  const atRisk = [];
  const roleAlerts = [];

  const guideTeamIds = role === 'Guide' && email
    ? new Set(getTeams().filter((team) => team.guideEmail === email.toLowerCase()).map((team) => team.id))
    : null;
  const relevantTasks = role === 'Student'
    ? scopedTasks.filter((task) => isTaskAssignedToStudent(task, email))
    : guideTeamIds
      ? scopedTasks.filter((task) => guideTeamIds.has(task.teamId))
      : scopedTasks;

  for (const task of relevantTasks) {
    const dueDate = new Date(`${task.dueDate}T00:00:00`);
    const daysUntilDue = Math.ceil((dueDate - today) / 86400000);
    const guideUploadedDocument = task.attachments?.some((attachment) => attachment.uploadedByRole === 'Guide') ?? false;
    const studentUploadedDocument = task.attachments?.some((attachment) => attachment.uploadedByRole === 'Student') ?? false;
    const guideFeedback = task.comments?.some((comment) => comment.role === 'Guide') ?? false;
    const coordinatorFeedback = task.comments?.some((comment) => comment.role === 'Coordinator') ?? false;
    const studentFeedback = task.comments?.some((comment) => comment.role === 'Student') ?? false;
    const weeklyFacultyFeedback = (task.milestones || []).flatMap((week) => week.feedbacks || [])
      .filter((feedback) => ['Guide', 'Coordinator'].includes(feedback.role));

    if (role === 'Student' && guideUploadedDocument) {
      roleAlerts.push(`Document: Your guide uploaded a new document for "${task.title}". Please review the task attachments.`);
    }
    if (role === 'Student' && (guideFeedback || coordinatorFeedback)) {
      const feedbackAuthor = coordinatorFeedback ? 'your coordinator' : 'your guide';
      roleAlerts.push(`Feedback: ${feedbackAuthor} left feedback on "${task.title}". Please review the task comments.`);
    }
    if (role === 'Student') {
      weeklyFacultyFeedback.forEach((feedback) => {
        roleAlerts.push(`Weekly feedback: ${feedback.author} left a note for "${task.title}". Review week ${task.milestones.find((week) => week.feedbacks?.some((note) => note.id === feedback.id))?.week}.`);
      });
    }
    if (role === 'Student' && ['Verified', 'Verified with suggested changes'].includes(task.guideReviewStatus)) {
      roleAlerts.push(`Verified: Your guide approved the update for "${task.title}".`);
    }
    if (role === 'Student' && task.guideReviewStatus === 'Not Done') {
      roleAlerts.push(`Action needed: Your guide requested changes to "${task.title}".`);
    }
    if (role === 'Student' && task.coordinatorReviewStatus === 'Reviewed') {
      roleAlerts.push(`Reviewed: Your coordinator reviewed "${task.title}".`);
    }
    if (role === 'Guide' && guideFeedback) {
      roleAlerts.push(`Feedback: A guide left feedback on "${task.title}". Please review the task comments.`);
    }
    if (role === 'Guide' && coordinatorFeedback) {
      roleAlerts.push(`Coordinator feedback: Review the coordinator's note on "${task.title}".`);
    }
    if (role === 'Guide' && task.guideReviewStatus === 'Pending') {
      roleAlerts.push(`Verification: "${task.title}" is waiting for your review (${task.assignee}).`);
    }
    if (role === 'Coordinator' && task.guideReviewStatus === 'Verified' && task.coordinatorReviewStatus === 'Pending') {
      roleAlerts.push(`Review: "${task.title}" was verified by its guide and is awaiting coordinator review.`);
    }
    if (role === 'Guide' && studentUploadedDocument) {
      roleAlerts.push(`Document: "${task.assignee}" uploaded a new document for "${task.title}". Review the task attachment.`);
    }
    if (role === 'Guide' && studentFeedback) {
      roleAlerts.push(`Feedback: "${task.assignee}" added feedback to "${task.title}". Please review the student update.`);
    }

    if (task.status === 'Completed') continue;

    if (daysUntilDue < 0) {
      overdue.push(role === 'Student'
        ? `Overdue: Your task "${task.title}" passed its deadline on ${task.dueDate}. Contact your guide if you need help.`
        : `Overdue: "${task.title}" passed its deadline on ${task.dueDate} (${task.assignee}).`);
    } else if (daysUntilDue <= 3) {
      dueSoon.push(role === 'Student'
        ? `Deadline: Your task "${task.title}" is due ${task.dueDate}.`
        : `Deadline: "${task.title}" is due ${task.dueDate} (${task.assignee}).`);
    }
    if (task.status === 'At Risk') {
      atRisk.push(role === 'Student'
        ? `At risk: Your task "${task.title}" is marked At Risk. Contact your guide if you need help.`
        : `At risk: "${task.title}" is ${task.progress}% complete and due ${task.dueDate} (${task.assignee}).`);
    } else if (daysUntilDue >= 0 && daysUntilDue <= 3 && task.progress < 60) {
      atRisk.push(role === 'Student'
        ? `At risk: Your task "${task.title}" is ${task.progress}% complete and due ${task.dueDate}. Please update your progress or contact your guide.`
        : `At risk: "${task.title}" is ${task.progress}% complete and due ${task.dueDate} (${task.assignee}).`);
    }
  }

  if (role === 'Student') return [...roleAlerts, ...atRisk, ...overdue, ...dueSoon].slice(0, 10);
  if (role === 'Guide') return [...roleAlerts, ...overdue, ...atRisk, ...dueSoon, ...state.notifications].slice(0, 10);
  return [...roleAlerts, ...overdue, ...atRisk, ...dueSoon, ...state.notifications].slice(0, 10);
}

function syncUserAccount(user) {
  const email = String(user.email).trim().toLowerCase();
  const existing = findUserByEmail(email);
  if (existing) {
    existing.name = user.name;
    existing.role = user.role;
    return existing;
  }
  const record = {
    id: String(user.id || Date.now()),
    name: user.name,
    email,
    password: '',
    role: user.role
  };
  state.users.push(record);
  return record;
}

function findUserByEmail(email) {
  return state.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase());
}

function assignTaskToTeam(task, team) {
  const students = team.studentEmails.map(findUserByEmail).filter(Boolean);
  task.assigneeEmails = students.map((student) => student.email);
  task.assignee = students.map((student) => student.name).join(', ') || 'Unassigned';
  if (students.length) task.assigneeEmail = students[0].email;
  else delete task.assigneeEmail;
}

function isTaskAssignedToStudent(task, email) {
  const normalizedEmail = String(email).toLowerCase();
  return task.assigneeEmails?.some((assigneeEmail) => assigneeEmail.toLowerCase() === normalizedEmail)
    || task.assigneeEmail?.toLowerCase() === normalizedEmail;
}

module.exports = {
  getTasks,
  addTaskMilestoneFeedback,
  reviewTaskMilestoneFeedback,
  getTaskById,
  getProjects,
  getUsers,
  getProjectById,
  getTeams,
  getTeamById,
  validateProjectTeam,
  addProjectTeam,
  getTeamForGuide,
  addProject,
  createProjectTeamsAndTasks,
  getWeeklyMilestone,
  addTask,
  updateTask,
  rescheduleFollowingWeeklyDeadlines,
  reviewTask,
  resetProjectMilestones,
  deleteTask,
  getTaskStats,
  getAiSummary,
  createAgentPlan,
  addTaskComment,
  getMessages,
  getTeamMessages,
  addMessage,
  addTaskAttachment,
  getNotifications,
  initializeDashboardState,
  refreshDashboardState,
  refreshDashboardState,
  persistDashboardState,
  clearNotifications,
  submitTask,
  syncUserAccount,
  findUserByEmail,
  isPublicHolidayDate,
  moveDeadlineOffHoliday,
  notifications: state.notifications,
  users: state.users
};
