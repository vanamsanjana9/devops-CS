import { useEffect, useMemo, useState } from 'react'
import './App.css'
import DeadlineCalendar from './components/DeadlineCalendar.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const defaultLogin = { email: '', password: '' }
const defaultRegister = { name: '', email: '', password: '', role: 'Student' }
const defaultProjectForm = { name: '', description: '', guideEmail: '', studentEmails: [] }

function isTaskAssignedToStudent(task, email) {
  const normalizedEmail = email.toLowerCase()
  return task.assigneeEmails?.some((assigneeEmail) => assigneeEmail.toLowerCase() === normalizedEmail)
    || task.assigneeEmail?.toLowerCase() === normalizedEmail
}

async function loadDashboardData(scope = {}) {
  const params = new URLSearchParams()
  if (scope.projectId) params.set('projectId', scope.projectId)
  if (scope.teamId) params.set('teamId', scope.teamId)
  if (scope.role) params.set('role', scope.role)
  if (scope.email) params.set('email', scope.email)
  const aiQuery = params.toString() ? `?${params.toString()}` : ''
  const [tasksRes, projectsRes, aiRes] = await Promise.all([
    fetch(`${API_URL}/tasks`),
    fetch(`${API_URL}/projects`),
    fetch(`${API_URL}/ai/summary${aiQuery}`),
  ])

  if (!tasksRes.ok || !projectsRes.ok || !aiRes.ok) {
    throw new Error('The dashboard could not load all of its data. Please try again.')
  }
  const [tasksData, projectsData, aiData] = await Promise.all([
    tasksRes.json(),
    projectsRes.json(),
    aiRes.json(),
  ])
  return {
    tasks: tasksData.tasks || [],
    projects: projectsData.projects || [],
    summary: aiData.summary || {},
    notifications: aiData.notifications || [],
  }
}

function App() {
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectForm, setProjectForm] = useState(defaultProjectForm)
  const [assignableUsers, setAssignableUsers] = useState({ guides: [], students: [] })
  const [projectError, setProjectError] = useState('')
  const [projectMessage, setProjectMessage] = useState('')
  const [projectLoading, setProjectLoading] = useState(false)
  const [summary, setSummary] = useState({ summary: {}, riskLevel: 'Moderate', insights: [], suggestedActions: [], tasksAtRisk: [] })
  const [notifications, setNotifications] = useState([])
  const [readNotifications, setReadNotifications] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')
  const [taskMessage, setTaskMessage] = useState('')
  const [taskError, setTaskError] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showAiInsights, setShowAiInsights] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [feedbackDrafts, setFeedbackDrafts] = useState({})
  const [deadlineDrafts, setDeadlineDrafts] = useState({})
  const [weeklyFeedbacks, setWeeklyFeedbacks] = useState({})
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentPlan, setAgentPlan] = useState(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [loginForm, setLoginForm] = useState(defaultLogin)
  const [registerForm, setRegisterForm] = useState(defaultRegister)
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [messageDraft, setMessageDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [studentTeamMessageDraft, setStudentTeamMessageDraft] = useState('')
  const [studentTeamMessages, setStudentTeamMessages] = useState([])
  const [studentTeamMessagesTeamId, setStudentTeamMessagesTeamId] = useState('')
  const [studentTeamChatError, setStudentTeamChatError] = useState('')

  const guideTeams = useMemo(() => currentUser?.role === 'Guide'
    ? projects.flatMap((project) => project.teams || []).filter((team) => team.guideEmail === currentUser.email)
    : [], [currentUser, projects])
  const guideTeam = guideTeams.find((team) => team.projectId === selectedProjectId) || guideTeams[0] || null
  const studentTeams = useMemo(() => currentUser?.role === 'Student'
    ? projects.flatMap((project) => project.teams || []).filter((team) => team.studentEmails
      .some((email) => email.toLowerCase() === currentUser.email.toLowerCase()))
    : [], [currentUser, projects])
  const studentTeam = studentTeams[0] || null
  const activeStudentTeamMessages = studentTeamMessagesTeamId === studentTeam?.id
    ? studentTeamMessages
    : []
  const dashboardScope = {
    role: currentUser?.role,
    email: currentUser?.email,
    projectId: currentUser?.role === 'Coordinator'
      ? selectedProjectId || undefined
      : currentUser?.role === 'Guide'
        ? selectedProjectId || undefined
        : studentTeams[0]?.projectId,
    teamId: currentUser?.role === 'Student' ? studentTeams[0]?.id : undefined,
  }
  const unreadNotificationCount = notifications.filter((notification) =>
    !readNotifications.has(`${currentUser?.email}:${notification}`)
  ).length

  const fetchDashboardData = async (scope = {}) => {
    try {
      const dashboard = await loadDashboardData(scope)
      setDashboardError('')
      setTasks(dashboard.tasks)
      setProjects(dashboard.projects)
      setSummary(dashboard.summary)
      setNotifications(dashboard.notifications)
    } catch (error) {
      console.error('Failed to load dashboard data', error)
      setDashboardError(error.message || 'Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignableUsers = async () => {
    const response = await fetch(`${API_URL}/projects/assignable-users`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Could not load project members.')
    return { guides: data.guides || [], students: data.students || [] }
  }

  useEffect(() => {
    if (currentUser?.role !== 'Coordinator') return undefined
    let active = true
    fetchAssignableUsers()
      .then((users) => {
        if (active) setAssignableUsers(users)
      })
      .catch((error) => {
        if (active) setProjectError(error.message || 'Could not load project members.')
      })
    return () => {
      active = false
    }
  }, [currentUser])

  useEffect(() => {
    let active = true
    loadDashboardData()
      .then((dashboard) => {
        if (!active) return
        setDashboardError('')
        setTasks(dashboard.tasks)
        setProjects(dashboard.projects)
        setSummary(dashboard.summary)
        setNotifications(dashboard.notifications)
      })
      .catch((error) => {
        if (!active) return
        console.error('Failed to load dashboard data', error)
        setDashboardError(error.message || 'Failed to load dashboard data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return undefined
    const scope = {
      role: currentUser.role,
      email: currentUser.email,
      projectId: currentUser.role === 'Coordinator'
        ? selectedProjectId || undefined
        : currentUser.role === 'Guide'
          ? selectedProjectId || undefined
          : studentTeams[0]?.projectId,
      teamId: currentUser.role === 'Student' ? studentTeams[0]?.id : undefined,
    }
    const refreshDashboard = async () => {
      try {
        const dashboard = await loadDashboardData(scope)
        setTasks(dashboard.tasks)
        setProjects(dashboard.projects)
        setSummary(dashboard.summary)
        setNotifications(dashboard.notifications)
      } catch (error) {
        console.error('Failed to refresh dashboard data', error)
      }
    }
    const intervalId = window.setInterval(refreshDashboard, 5_000)
    return () => window.clearInterval(intervalId)
  }, [currentUser, selectedProjectId, guideTeams, studentTeams])

  const guideProjects = projects.filter((project) => project.teams.some((team) => guideTeams.some((guideTeamItem) => guideTeamItem.id === team.id)))
  const dashboardProjects = currentUser?.role === 'Coordinator'
    ? projects
    : currentUser?.role === 'Guide'
      ? guideProjects.filter((project) => !selectedProjectId || project.id === selectedProjectId)
      : projects.filter((project) => project.teams.some((team) => studentTeams.some((studentTeam) => studentTeam.id === team.id)))
  const activeProjectId = currentUser?.role === 'Coordinator'
    ? selectedProjectId
    : currentUser?.role === 'Guide'
      ? selectedProjectId || (dashboardProjects.length === 1 ? dashboardProjects[0].id : '')
      : studentTeams[0]?.projectId || ''
  const activeProject = projects.find((project) => project.id === activeProjectId) || null
  const visibleGuideTeams = guideTeams.filter((team) => !selectedProjectId || team.projectId === selectedProjectId)
  useEffect(() => {
    if (!currentUser || !activeProjectId || !['Coordinator', 'Guide'].includes(currentUser.role)) {
      return undefined
    }

    let active = true
    const fetchProjectMessages = async () => {
      try {
        const response = await fetch(`${API_URL}/messages?projectId=${encodeURIComponent(activeProjectId)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || 'Could not load project messages.')
        if (active) setMessages(data.messages || [])
      } catch (error) {
        if (active) setTaskError(error.message || 'Could not load project messages.')
      }
    }

    fetchProjectMessages()
    const intervalId = window.setInterval(fetchProjectMessages, 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeProjectId, currentUser])

  useEffect(() => {
    if (currentUser?.role !== 'Student' || !studentTeam?.id) return undefined

    let active = true
    const fetchTeamMessages = async () => {
      try {
        const params = new URLSearchParams({
          teamId: studentTeam.id,
          role: 'Student',
          email: currentUser.email,
        })
        const response = await fetch(`${API_URL}/messages?${params}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || 'Could not load team chat.')
        if (active) {
          setStudentTeamMessages(data.messages || [])
          setStudentTeamMessagesTeamId(studentTeam.id)
          setStudentTeamChatError('')
        }
      } catch (error) {
        if (active) setStudentTeamChatError(error.message || 'Could not load team chat.')
      }
    }

    fetchTeamMessages()
    const intervalId = window.setInterval(fetchTeamMessages, 15_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [currentUser?.email, currentUser?.role, studentTeam?.id])

  const visibleTasks = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.role === 'Coordinator') {
      return tasks.filter((task) => !selectedProjectId || task.projectId === selectedProjectId)
        .sort((left, right) => (left.milestoneWeek ?? Infinity) - (right.milestoneWeek ?? Infinity))
    }
    if (currentUser.role === 'Guide') {
      const teamIds = new Set(guideTeams.map((team) => team.id))
      return tasks.filter((task) => teamIds.has(task.teamId)
        && (!selectedProjectId || task.projectId === selectedProjectId))
        .sort((left, right) => (left.milestoneWeek ?? Infinity) - (right.milestoneWeek ?? Infinity))
    }
    return tasks.filter((task) => isTaskAssignedToStudent(task, currentUser.email))
      .sort((left, right) => (left.milestoneWeek || 0) - (right.milestoneWeek || 0))
  }, [currentUser, guideTeams, selectedProjectId, tasks])
  const calendarTasks = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.role === 'Student') {
      return tasks.filter((task) => isTaskAssignedToStudent(task, currentUser.email)
        && task.status !== 'Completed')
    }
    if (currentUser.role === 'Guide') {
      const teamIds = new Set(guideTeams.map((team) => team.id))
      return tasks.filter((task) => teamIds.has(task.teamId)
        && (!selectedProjectId || task.projectId === selectedProjectId))
    }
    return tasks.filter((task) => !selectedProjectId || task.projectId === selectedProjectId)
  }, [currentUser, guideTeams, selectedProjectId, tasks])
  const milestoneProgressTasks = useMemo(() => currentUser?.role === 'Student'
    ? tasks.filter((task) => isTaskAssignedToStudent(task, currentUser.email))
      .sort((left, right) => (left.milestoneWeek ?? Infinity) - (right.milestoneWeek ?? Infinity))
    : visibleTasks, [currentUser, tasks, visibleTasks])
  const guideProgress = visibleGuideTeams.length
    ? Math.round(visibleGuideTeams.reduce((total, team) => total + (team.stats?.progress || 0), 0) / visibleGuideTeams.length)
    : 0
  const guideCompletedTasks = visibleGuideTeams.reduce((total, team) => total + (team.stats?.completed || 0), 0)
  const guideTotalTasks = visibleGuideTeams.reduce((total, team) => total + (team.stats?.total || 0), 0)

  const communicationPartner = currentUser?.role === 'Guide' ? 'Coordinator' : 'Guide'
  const roleMessages = useMemo(() => messages.filter((message) => {
    const isSender = message.senderRole === currentUser?.role
    const isReceiver = message.receiverRole === currentUser?.role
    const isPartnerMessage = (message.senderRole === communicationPartner && message.receiverRole === currentUser?.role)
      || (message.senderRole === currentUser?.role && message.receiverRole === communicationPartner)
    return isPartnerMessage || (isSender && isReceiver)
  }), [communicationPartner, currentUser?.role, messages])

  const filteredTasks = useMemo(() => visibleTasks.filter((task) => {
    const query = searchTerm.trim().toLowerCase()
    const matchesQuery = !query || [task.title, task.description, task.assignee, task.team]
      .some((value) => (value || '').toLowerCase().includes(query))
    return matchesQuery && (statusFilter === 'All statuses' || task.status === statusFilter)
  }), [searchTerm, statusFilter, visibleTasks])

  const handleProjectSubmit = async (event) => {
    event.preventDefault()
    if (!projectForm.guideEmail) {
      setProjectError('Select a faculty guide for this project.')
      return
    }
    if (projectForm.studentEmails.length !== 3) {
      setProjectError('Select exactly three students for the project team.')
      return
    }
    setProjectLoading(true)
    setProjectError('')
    setProjectMessage('')
    try {
      const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectForm),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not create project.')
      setProjectForm(defaultProjectForm)
      setSelectedProjectId(data.project.id)
      setProjectMessage('Project created and assigned to its guide and three students.')
      await fetchDashboardData({ role: currentUser?.role, email: currentUser?.email, projectId: data.project.id })
      setAssignableUsers(await fetchAssignableUsers())
    } catch (error) {
      setProjectError(error.message || 'Could not create project.')
    } finally {
      setProjectLoading(false)
    }
  }

  const handleProjectPdfUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const isExcel = file.name.toLowerCase().endsWith('.xlsx')
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf && !isExcel) {
      setProjectError('Choose a searchable PDF or an Excel .xlsx workbook.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProjectError('The file must be 5 MB or smaller.')
      return
    }

    setProjectLoading(true)
    setProjectError('')
    setProjectMessage('')
    try {
      const response = await fetch(`${API_URL}/projects/import-file`, {
        method: 'POST',
        headers: {
          'Content-Type': isExcel
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        },
        body: file,
      })
      const responseText = await response.text()
      let data
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        const serverHint = response.status === 404
          ? 'The backend does not have the project-file import route. Restart it with "npm run dev" from the Taskflow project root.'
          : `The server returned an unexpected response (HTTP ${response.status}). Check that the TaskFlow backend is running on port 5000.`
        throw new Error(serverHint)
      }
      if (!response.ok) throw new Error(data.message || 'Could not import the project file.')

      const newGuides = data.createdUsers.filter((user) => user.role === 'Guide').length
      const newStudents = data.createdUsers.filter((user) => user.role === 'Student').length
      const credentials = [
        newGuides ? `new guides sign in with guide123` : '',
        newStudents ? `new students sign in with student123` : '',
      ].filter(Boolean)
      const accountMessage = data.createdUsers.length
        ? ` Registered ${data.createdUsers.length} new account(s)${credentials.length ? `; ${credentials.join(' and ')}.` : '.'}`
        : ' All guide and student accounts already existed.'

      const importedProjects = data.projects || [data.project]
      const projectCount = importedProjects.length
      setSelectedProjectId(importedProjects[0].id)
      setProjectMessage(
        `Imported ${projectCount} project${projectCount === 1 ? '' : 's'} from ${isExcel ? 'Excel' : 'PDF'} locally and assigned the guides and students.${accountMessage}`
      )
      await fetchDashboardData({
        role: currentUser?.role,
        email: currentUser?.email,
        projectId: importedProjects[0].id,
      })
      setAssignableUsers(await fetchAssignableUsers())
    } catch (error) {
      setProjectError(error.message || 'Could not import the project PDF.')
    } finally {
      setProjectLoading(false)
    }
  }

  const handleProjectStudentSelection = (studentEmail, selected) => {
    setProjectForm((previous) => {
      const alreadySelected = previous.studentEmails.includes(studentEmail)
      if (selected && !alreadySelected && previous.studentEmails.length >= 3) return previous
      return {
        ...previous,
        studentEmails: selected
          ? [...previous.studentEmails, studentEmail]
          : previous.studentEmails.filter((email) => email !== studentEmail),
      }
    })
  }

  const handleProjectSetup = async (projectId) => {
    setProjectLoading(true)
    setProjectError('')
    setProjectMessage('')
    try {
      const response = await fetch(`${API_URL}/projects/${encodeURIComponent(projectId)}/agent-setup`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'AI team setup failed.')
      const assignedCount = data.tasks.filter((task) => task.assignmentStatus === 'Assigned').length
      const queuedCount = data.tasks.filter((task) => task.assignmentStatus === 'Queued').length
      setProjectMessage(`AI created ${data.teams.length} team(s), assigned ${assignedCount} starting milestone(s), and queued ${queuedCount} weekly milestone(s).`)
      await fetchDashboardData({ role: currentUser?.role, email: currentUser?.email, projectId })
    } catch (error) {
      setProjectError(error.message || 'AI team setup failed.')
    } finally {
      setProjectLoading(false)
    }
  }

  const handleProjectSelect = (projectId) => {
    setSelectedProjectId(projectId)
    setMessages([])
    setAgentPlan(null)
    setAgentError('')
    fetchDashboardData({
      role: currentUser?.role,
      email: currentUser?.email,
      projectId: projectId || undefined,
    })
  }

  const handleProjectMilestoneReset = async (project) => {
    const confirmed = window.confirm(`Reset all weekly milestones for "${project.name}"? Progress and review states will be cleared, but feedback and documents will remain.`)
    if (!confirmed) return

    try {
      setProjectError('')
      setProjectLoading(true)
      const response = await fetch(`${API_URL}/projects/${encodeURIComponent(project.id)}/reset-milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentUser?.role }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not reset project milestones.')
      setTaskMessage(`Reset weekly milestones for ${project.name}.`)
      await fetchDashboardData(dashboardScope)
    } catch (error) {
      setProjectError(error.message || 'Could not reset project milestones.')
    } finally {
      setProjectLoading(false)
    }
  }

  const updateTask = async (taskId, updates) => {
    try {
      setTaskError('')
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, actorRole: currentUser?.role }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Task update failed.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? data.task : task))
      if (updates.dueDate !== undefined) {
        setDeadlineDrafts((previous) => {
          const next = { ...previous }
          delete next[taskId]
          return next
        })
        setTaskMessage(`Deadline saved for ${data.task.dueDate}.`)
      } else {
        setTaskMessage('Task updated.')
      }
      await fetchDashboardData(dashboardScope)
    } catch (error) {
      setTaskError(error.message || 'Task update failed.')
    }
  }

  const saveTaskDeadline = (taskId) => {
    const dueDate = deadlineDrafts[taskId]
    if (dueDate) updateTask(taskId, { dueDate })
  }

  const handleTaskReview = async (taskId, decision) => {
    try {
      setTaskError('')
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerRole: currentUser?.role,
          reviewerName: currentUser?.name,
          decision,
          feedback: feedbackDrafts[taskId] || '',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not save the review.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? data.task : task))
      if ((feedbackDrafts[taskId] || '').trim()) {
        setFeedbackDrafts((previous) => ({ ...previous, [taskId]: '' }))
      }
      setTaskMessage(decision === 'Verified'
        ? 'Guide review saved. The task is ready for coordinator review.'
        : decision === 'Verified with suggested changes'
          ? 'Suggested changes were requested. Coordinator review will wait for guide verification.'
          : decision === 'Changes updated'
            ? 'Changes updated. Guide review options are available again.'
            : 'Coordinator review saved.')
      await fetchDashboardData(dashboardScope)
    } catch (error) {
      setTaskError(error.message || 'Could not save the review.')
    }
  }

  const handleStudentTaskSubmit = async (taskId) => {
    try {
      setTaskError('')
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentUser?.role, email: currentUser?.email }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not submit the task.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? data.task : task))
      setTaskMessage('Task submitted to your guide for review.')
      await fetchDashboardData(dashboardScope)
    } catch (error) {
      setTaskError(error.message || 'Could not submit the task.')
    }
  }

  const clearAllNotifications = async () => {
    try {
      const response = await fetch(`${API_URL}/ai/notifications`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not clear notifications.')
      setNotifications(data.notifications || [])
      setReadNotifications(new Set())
    } catch (error) {
      setTaskError(error.message || 'Could not clear notifications.')
    }
  }

  const handleMilestoneFeedbackChange = (taskId, weekIndex, value) => {
    setWeeklyFeedbacks((previous) => ({
      ...previous,
      [taskId]: {
        ...(previous[taskId] || {}),
        [weekIndex]: value,
      },
    }))
  }

  const handleMilestoneFeedbackSave = async (taskId, weekIndex) => {
    const value = (weeklyFeedbacks[taskId]?.[weekIndex] || '').trim()
    if (!value) {
      setTaskError('Please enter feedback before saving for this week.')
      return
    }
    if (!['Guide', 'Coordinator'].includes(currentUser?.role)) return

    try {
      setTaskError('')
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}/milestones/${weekIndex}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: value, role: currentUser.role, author: currentUser.name }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not save weekly feedback.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? data.task : task))
      setWeeklyFeedbacks((previous) => ({
        ...previous,
        [taskId]: { ...(previous[taskId] || {}), [weekIndex]: '' },
      }))
      setTaskMessage(`Feedback saved for week ${weekIndex + 1}.`)
    } catch (error) {
      setTaskError(error.message || 'Could not save weekly feedback.')
    }
  }

  const handleMilestoneFeedbackReview = async (taskId, weekIndex, feedbackId) => {
    try {
      setTaskError('')
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}/milestones/${weekIndex}/feedback/${encodeURIComponent(feedbackId)}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: currentUser.role }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not mark weekly feedback as reviewed.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? data.task : task))
      setTaskMessage(`Guide feedback marked reviewed for week ${weekIndex + 1}.`)
    } catch (error) {
      setTaskError(error.message || 'Could not mark weekly feedback as reviewed.')
    }
  }

  const renderTaskMilestones = (task) => {
    if (currentUser?.role === 'Student' || !task.milestones?.length) return null
    const completedWeeks = task.milestones.filter((week) => week.completed).length
    const progress = Math.round((completedWeeks / task.milestones.length) * 100)

    return (
      <details className="task-milestones" open={['Coordinator', 'Guide'].includes(currentUser?.role)}>
        <summary>
          <strong>Task Weekly Milestones</strong>
          <small>{completedWeeks}/{task.milestones.length} weeks · {progress}%</small>
        </summary>
        <div className="project-progress milestone-progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="milestone-weeks">
          {task.milestones.map((week, weekIndex) => (
            <div className="milestone-week" key={week.week}>
              <label className="milestone-week-toggle">
                <input
                  type="checkbox"
                  checked={week.completed}
                  disabled
                />
                <strong>Week {week.week}</strong>
                <span>{week.heading}</span>
                {currentUser?.role !== 'Student' && (
                  <span className={`week-mark-status ${week.completed ? 'completed' : task.guideReviewStatus === 'Pending' ? 'submitted' : 'pending'}`}>
                    {week.completed
                      ? `${week.updatedBy || 'Coordinator'} marked complete`
                      : task.guideReviewStatus === 'Not Done'
                        ? 'Not done - resubmission needed'
                        : task.submittedAt
                        ? 'Student submitted'
                        : task.assignmentStatus === 'Queued'
                          ? 'AI queued'
                          : 'Awaiting student submission'}
                  </span>
                )}
              </label>
              <ul>
                {week.items.map((item, itemIndex) => <li key={`${week.week}-${itemIndex}`}>{item}</li>)}
              </ul>

              <div className="milestone-feedback">
                <label>
                  Week feedback
                  <textarea
                    value={weeklyFeedbacks[task.id]?.[weekIndex] || ''}
                    onChange={(event) => handleMilestoneFeedbackChange(task.id, weekIndex, event.target.value)}
                    rows="2"
                    disabled={currentUser?.role === 'Student'}
                    placeholder={currentUser?.role === 'Student'
                      ? 'Guide and coordinator feedback will appear here.'
                      : `Add your feedback for week ${weekIndex + 1}...`}
                  />
                </label>
                {(week.feedbacks || []).map((feedback) => (
                  <div className="milestone-feedback-entry" key={feedback.id}>
                    <strong>{feedback.author} · {feedback.role}</strong>
                    <p>{feedback.text}</p>
                    {feedback.role === 'Guide' && currentUser?.role === 'Coordinator' && (
                      feedback.coordinatorReviewed ? (
                        <span className="week-mark-status completed">Reviewed</span>
                      ) : (
                        <button
                          type="button"
                          className="secondary-btn small-btn milestone-feedback-btn"
                          onClick={() => handleMilestoneFeedbackReview(task.id, weekIndex, feedback.id)}
                        >
                          Mark reviewed
                        </button>
                      )
                    )}
                  </div>
                ))}
                {currentUser?.role !== 'Student' && (
                  <button
                    type="button"
                    className="secondary-btn small-btn milestone-feedback-btn"
                    onClick={() => handleMilestoneFeedbackSave(task.id, weekIndex)}
                    disabled={!(weeklyFeedbacks[task.id]?.[weekIndex] || '').trim()}
                  >
                    Save feedback
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
    )
  }

  const handleFeedbackSubmit = async (event, taskId) => {
    event.preventDefault()
    const text = (feedbackDrafts[taskId] || '').trim()
    if (!text) return
    try {
      setTaskError('')
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author: currentUser.name, role: currentUser.role }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not post feedback.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? data.task : task))
      setFeedbackDrafts((previous) => ({ ...previous, [taskId]: '' }))
      setTaskMessage('Feedback added.')
      await fetchDashboardData(dashboardScope)
    } catch (error) {
      setTaskError(error.message || 'Could not post feedback.')
    }
  }

  const handleAttachmentUpload = async (event, taskId) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setTaskError('Attachments must be smaller than 5 MB.')
      return
    }
    try {
      setTaskError('')
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Could not read the selected file.'))
        reader.readAsDataURL(file)
      })
      const response = await fetch(`${API_URL}/tasks/${encodeURIComponent(taskId)}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          data,
          uploadedBy: currentUser?.name || 'Guide',
          uploadedByRole: currentUser?.role || 'Guide',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not upload attachment.')
      setTasks((previous) => previous.map((task) => task.id === taskId ? result.task : task))
      setTaskMessage(`${file.name} attached to task.`)
      await fetchDashboardData(dashboardScope)
    } catch (error) {
      setTaskError(error.message || 'Could not upload attachment.')
    }
  }

  const handleAgentSubmit = async (event) => {
    event.preventDefault()
    setAgentLoading(true)
    setAgentError('')
    setAgentPlan(null)
    try {
      const response = await fetch(`${API_URL}/ai/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: agentPrompt,
          projectId: currentUser?.role === 'Guide' && !selectedProjectId ? undefined : activeProjectId || undefined,
          teamId: currentUser?.role === 'Student' ? studentTeams[0]?.id : undefined,
          role: currentUser?.role,
          email: currentUser?.email,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'The task agent could not create a plan.')
      setAgentPlan({
        ...data.plan,
        actions: data.plan.actions || [],
      })
    } catch (error) {
      setAgentError(error.message || 'The task agent could not create a plan.')
    } finally {
      setAgentLoading(false)
    }
  }

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Login failed')
      }

      setCurrentUser(data.user)
      setAuthError('')
      setLoginForm(defaultLogin)
      const userTeam = data.user.role === 'Student'
        ? projects.flatMap((project) => project.teams || []).find((team) => team.studentEmails.includes(data.user.email))
        : null
      await fetchDashboardData({ role: data.user.role, email: data.user.email, projectId: userTeam?.projectId, teamId: userTeam?.id })
    } catch (error) {
      setAuthError(error instanceof TypeError ? 'Cannot reach the TaskFlow server. Start the backend on port 5000 and try again.' : error.message)
    }
  }

  const handleForgotPassword = async () => {
    const email = window.prompt('Enter your email address to reset the password:')
    if (!email) return

    const password = window.prompt('Enter your new password:')
    if (!password) return

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Password reset failed.')
      }

      setAuthError('')
      setLoginForm((previous) => ({ ...previous, email, password }))
      window.alert('Password reset successful. You can now log in with your new password.')
    } catch (error) {
      setAuthError(error.message || 'Password reset failed.')
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
          role: registerForm.role,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Registration failed')
      }

      setCurrentUser(data.user)
      setAuthError('')
      setRegisterForm(defaultRegister)
      await fetchDashboardData({ role: data.user.role, email: data.user.email })
    } catch (error) {
      setAuthError(error instanceof TypeError ? 'Cannot reach the TaskFlow server. Start the backend on port 5000 and try again.' : error.message)
    }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setMessages([])
    setStudentTeamMessages([])
    setStudentTeamMessagesTeamId('')
    setStudentTeamMessageDraft('')
    setSelectedProjectId('')
    setAssignableUsers({ guides: [], students: [] })
    setAuthError('')
    setAuthMode('login')
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()
    const text = messageDraft.trim()
    if (!text || !currentUser || !activeProjectId) return

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          senderEmail: currentUser.email,
          senderRole: currentUser.role,
          text,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not send the message.')
      setMessages((previous) => [...previous, data.message])
      setMessageDraft('')
    } catch (error) {
      setTaskError(error.message || 'Could not send the message.')
    }
  }

  const handleSendStudentTeamMessage = async (event) => {
    event.preventDefault()
    const text = studentTeamMessageDraft.trim()
    if (!text || !currentUser || !studentTeam) return

    try {
      setStudentTeamChatError('')
      const response = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: studentTeam.id,
          senderEmail: currentUser.email,
          senderRole: 'Student',
          text,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not send team message.')
      setStudentTeamMessages((previous) => [...previous, data.message])
      setStudentTeamMessagesTeamId(studentTeam.id)
      setStudentTeamMessageDraft('')
    } catch (error) {
      setStudentTeamChatError(error.message || 'Could not send team message.')
    }
  }

  const formatSenderLabel = (message) => {
    if (message.senderRole === currentUser?.role) return 'You'
    return message.senderName || message.senderRole || 'Team member'
  }

  const roleLabel = {
    Coordinator: 'Coordinator Dashboard',
    Guide: 'Guide Dashboard',
    Student: 'Student Dashboard',
  }

  const statusClass = (status) => {
    const map = {
      Queued: 'status-queued',
      'To Do': 'status-todo',
      'In Progress': 'status-progress',
      Review: 'status-review',
      'At Risk': 'status-risk',
      Completed: 'status-complete',
    }
    return map[status] || 'status-default'
  }

  const workflowStatus = (task) => {
    if (task.assignmentStatus === 'Queued') return 'AI queued'
    if (task.coordinatorReviewStatus === 'Reviewed') return 'Coordinator reviewed'
    if (task.guideReviewStatus === 'Verified') return 'Guide verified'
    if (task.guideReviewStatus === 'Verified with suggested changes') return 'Changes requested'
    if (task.guideReviewStatus === 'Changes updated') return 'Guide verified'
    if (task.guideReviewStatus === 'Pending') return 'Student submitted'
    if (task.guideReviewStatus === 'Not Done') return 'Not done'
    return 'Assigned'
  }

  const priorityClass = (priority) => {
    const map = {
      High: 'priority-high',
      Medium: 'priority-medium',
      Low: 'priority-low',
    }
    return map[priority] || 'priority-medium'
  }

  if (!currentUser) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-branding">
            <p className="auth-brand-line">TASKFLOW - TEAM MANAGEMENT SYSTEM</p>
            <p className="eyebrow">Project coordination platform</p>
          </div>

          <div className="auth-toggle">
            <button
              type="button"
              className={authMode === 'login' ? 'toggle-btn active' : 'toggle-btn'}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'toggle-btn active' : 'toggle-btn'}
              onClick={() => setAuthMode('register')}
            >
              Register
            </button>
          </div>

          {authError && <div className="auth-error">{authError}</div>}

          {authMode === 'login' ? (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                Password
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((previous) => !previous)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="password-icon">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        <path d="M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="password-icon">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              <div className="auth-links">
                <button type="button" className="text-link" onClick={handleForgotPassword}>Forgot password?</button>
              </div>

              <button type="submit" className="primary-btn auth-submit">Login</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegisterSubmit}>
              <label>
                Full name
                <input
                  type="text"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
                  placeholder="Your full name"
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                  placeholder="Create password"
                  required
                />
              </label>

              <label>
                Role
                <select
                  value={registerForm.role}
                  onChange={(event) => setRegisterForm({ ...registerForm, role: event.target.value })}
                >
                  <option value="Coordinator">Coordinator</option>
                  <option value="Guide">Guide</option>
                  <option value="Student">Student</option>
                </select>
              </label>

              <button type="submit" className="primary-btn auth-submit">Create account</button>
            </form>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="app-shell loading">Loading TaskFlow dashboard...</div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{roleLabel[currentUser.role]}</p>
          <h1>Welcome, {currentUser.name}</h1>
        </div>

        <div className="topbar-actions">
          <div className="notification-wrapper">
            <button
              type="button"
              className="notification-toggle"
              aria-label="Toggle notifications"
              onClick={() => {
                const opening = !showNotifications
                if (opening) {
                  setReadNotifications((previous) => new Set([
                    ...previous,
                    ...notifications.map((notification) => `${currentUser.email}:${notification}`),
                  ]))
                }
                setShowNotifications(opening)
              }}
            >
              <span className="notification-icon" aria-hidden="true">🔔</span>
              {unreadNotificationCount > 0 && <span className="notification-badge">{unreadNotificationCount}</span>}
            </button>

            {showNotifications && (
              <div className="notification-popover">
                <div className="panel-header compact">
                  <h2>Notifications</h2>
                  <button type="button" className="secondary-btn small-btn" onClick={clearAllNotifications}>
                    Clear all
                  </button>
                </div>
                <ul className="notification-list">
                  {(notifications || []).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            className="ai-topbar-card"
            onClick={() => setShowAiInsights((previous) => !previous)}
            aria-label="Toggle AI insights summary"
          >
            <div className="ai-topbar-card-header">
              <strong>AI Insights</strong>
              <span className="risk-pill">{summary.riskLevel || 'Moderate'}</span>
            </div>
            <div className="ai-topbar-metrics">
              <span>{summary.summary?.totalTasks || 0} monitored</span>
              <span>{summary.summary?.atRiskTasks || 0} flagged</span>
              <span>{summary.summary?.dueSoon || 0} due soon</span>
            </div>

            {showAiInsights && (
              <div className="ai-topbar-summary">
                <ul>
                  {(summary.insights || []).slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {(summary.suggestedActions || []).length > 0 && (
                  <p>{(summary.suggestedActions || [])[0]}</p>
                )}
              </div>
            )}
          </button>

          {(['Coordinator', 'Student'].includes(currentUser.role) || (currentUser.role === 'Guide' && guideTeam)) && <div className="agent-launcher-wrapper">
            <button
              type="button"
              className="agent-launcher"
              aria-label="Open AI assistant"
              onClick={() => document.getElementById('workflow-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              <span className="agent-launcher-icon" aria-hidden="true">🤖</span>
            </button>
          </div>}

          <span className="user-pill">{currentUser.name}</span>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {dashboardError && <div className="auth-error dashboard-notice">{dashboardError}</div>}
      {taskError && <div className="auth-error dashboard-notice">{taskError}</div>}
      {taskMessage && <div className="success-notice dashboard-notice">{taskMessage}</div>}

      {(currentUser.role === 'Guide' || currentUser.role === 'Coordinator') && (
        <section className="panel messaging-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Communication hub</p>
              <h2>{currentUser.role === 'Guide' ? `${currentUser.name} • Message coordinator` : `${currentUser.name} • Message guide team`}</h2>
            </div>
            {currentUser.role === 'Coordinator' && (
              <label className="guide-project-picker">
                Conversation project
                <select value={selectedProjectId} onChange={(event) => handleProjectSelect(event.target.value)}>
                  <option value="">Select a project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            )}
            {currentUser.role === 'Guide' && guideProjects.length > 1 && (
              <label className="guide-project-picker">
                Conversation project
                <select value={selectedProjectId} onChange={(event) => handleProjectSelect(event.target.value)}>
                  <option value="">Select a project</option>
                  {guideProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            )}
            {!activeProjectId && <span className="pill">{communicationPartner}</span>}
          </div>

          {activeProjectId ? <div className="message-layout">
            <div className="message-stream">
              {roleMessages.length ? (
                roleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-bubble ${message.senderRole === currentUser.role ? 'outgoing' : 'incoming'}`}
                  >
                    <div className="message-meta">
                      <strong>{formatSenderLabel(message)}</strong>
                      <span>{message.timestamp}</span>
                    </div>
                    <p>{message.text}</p>
                  </div>
                ))
              ) : (
                <p className="empty-state">No messages yet. Start the conversation.</p>
              )}
            </div>

            <form className="message-form" onSubmit={handleSendMessage}>
              <textarea
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder={`Send a message to the ${communicationPartner.toLowerCase()}...`}
                rows="4"
              />
              <button type="submit" className="primary-btn">Send message</button>
            </form>
          </div> : <p className="empty-state">Select a project to open its guide–coordinator conversation.</p>}
        </section>
      )}

      {currentUser.role === 'Student' && (
        <section className="panel messaging-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Student team chat</p>
              <h2>{studentTeam?.name || 'Team chat'}</h2>
            </div>
            {studentTeam && <span className="pill">{studentTeam.students?.length || 3} students</span>}
          </div>
          {studentTeamChatError && <p className="inline-error" role="alert">{studentTeamChatError}</p>}
          {studentTeam ? <div className="message-layout">
            <div className="message-stream" aria-live="polite">
              {activeStudentTeamMessages.length ? (
                activeStudentTeamMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-bubble ${message.senderEmail?.toLowerCase() === currentUser.email.toLowerCase() ? 'outgoing' : 'incoming'}`}
                  >
                    <div className="message-meta">
                      <strong>{message.senderEmail?.toLowerCase() === currentUser.email.toLowerCase()
                        ? 'You'
                        : message.senderName || 'Team member'}</strong>
                      <span>{message.timestamp}</span>
                    </div>
                    <p>{message.text}</p>
                  </div>
                ))
              ) : (
                <p className="empty-state">No team messages yet. Start the conversation.</p>
              )}
            </div>
            <form className="message-form" onSubmit={handleSendStudentTeamMessage}>
              <textarea
                value={studentTeamMessageDraft}
                onChange={(event) => setStudentTeamMessageDraft(event.target.value)}
                placeholder="Message your team..."
                rows="3"
                maxLength="2000"
              />
              <button type="submit" className="primary-btn" disabled={!studentTeamMessageDraft.trim()}>
                Send message
              </button>
            </form>
          </div> : <p className="empty-state">A team must be assigned before its chat is available.</p>}
        </section>
      )}

      <section className="stats-grid">
        <div className="stat-card accent">
          <span>{currentUser.role === 'Student' ? 'My Tasks' : 'Total Tasks'}</span>
          <strong>{visibleTasks.length}</strong>
        </div>
        <div className="stat-card">
          <span>In Progress</span>
          <strong>{visibleTasks.filter((task) => task.status === 'In Progress').length}</strong>
        </div>
        <div className="stat-card">
          <span>Completed</span>
          <strong>{visibleTasks.filter((task) => task.status === 'Completed').length}</strong>
        </div>
        <div className="stat-card warning">
          <span>At Risk</span>
          <strong>{visibleTasks.filter((task) => task.status === 'At Risk').length}</strong>
        </div>
      </section>

      {currentUser.role === 'Coordinator' && (
        <section className="panel projects-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Portfolio overview</p>
              <h2>Projects</h2>
            </div>
            <span className="pill">{projects.length} projects</span>
          </div>
          <div className="project-card-grid">
            <button
              type="button"
              className={`project-card all-projects-card ${!selectedProjectId ? 'selected' : ''}`}
              onClick={() => handleProjectSelect('')}
            >
              <span className="project-status">Portfolio</span>
              <h3>All projects</h3>
              <p>Compare work across every team.</p>
              <strong>{projects.length} projects · {tasks.length} tasks</strong>
            </button>
            {projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={`project-card ${selectedProjectId === project.id ? 'selected' : ''}`}
                onClick={() => handleProjectSelect(project.id)}
              >
                <span className="project-status">{project.status}</span>
                <h3>{project.name}</h3>
                <p>{project.description}</p>
                <div className="project-progress">
                  <span style={{ width: `${project.stats.progress}%` }} />
                </div>
                <div className="project-card-metrics">
                  <span>{project.stats.progress}% avg. progress</span>
                  <span>{project.stats.completed}/{project.stats.total} completed</span>
                </div>
                <div className="project-card-footer">
                  <span>{project.teams.length} team(s)</span>
                  <span>{project.stats.atRisk} at risk · {project.stats.overdue} overdue</span>
                </div>
              </button>
            ))}
          </div>
          {activeProject && (
            <div className="project-detail">
              <div className="project-detail-heading">
                <div>
                  <p className="eyebrow">Selected project</p>
                  <h3>{activeProject.name}</h3>
                  <p>{activeProject.description}</p>
                </div>
                {activeProject.teams.length === 0 && (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleProjectSetup(activeProject.id)}
                    disabled={projectLoading}
                  >
                    {projectLoading ? 'Setting up teams...' : 'AI create teams, assign guides & tasks'}
                  </button>
                )}
                {activeProject.teams.length > 0 && (
                  <button
                    type="button"
                    className="secondary-btn small-btn"
                    onClick={() => handleProjectMilestoneReset(activeProject)}
                    disabled={projectLoading}
                  >
                    Reset weekly milestones
                  </button>
                )}
              </div>
              {activeProject.teams.length > 0 && (
                <div className="project-team-list">
                  {activeProject.teams.map((team) => (
                    <div className="project-team-card" key={team.id}>
                      <strong>{team.name}</strong>
                      <span>Guide: {team.guide?.name || team.guideEmail}</span>
                      <span>Students: {team.students.map((student) => student.name).join(', ')}</span>
                      <div className="project-progress"><span style={{ width: `${team.stats.progress}%` }} /></div>
                      <span>{team.stats.progress}% progress · {team.stats.completed}/{team.stats.total} complete · {team.stats.atRisk} at risk</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            <form className="project-create-form" onSubmit={handleProjectSubmit}>
              <h3>Create academic project</h3>
              <label>
                Create from project PDF or Excel
                <input
                  type="file"
                  accept="application/pdf,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleProjectPdfUpload}
                  disabled={projectLoading}
                />
                <small>Upload a searchable PDF or an Excel .xlsx workbook (max 5 MB). For Excel, use one project per row with these headers: Project Title, Description, Guide Name, Guide Email, Student 1 Name, Student 1 Email, Student 2 Name, Student 2 Email, Student 3 Name, Student 3 Email. All project rows are imported locally; missing accounts are registered and assigned. Each student can be assigned to only one project.</small>
              </label>
              <label>
                Project title
                <input value={projectForm.name} onChange={(event) => setProjectForm((previous) => ({ ...previous, name: event.target.value }))} maxLength="120" required />
              </label>
              <label>
                Project description
                <textarea value={projectForm.description} onChange={(event) => setProjectForm((previous) => ({ ...previous, description: event.target.value }))} rows="3" maxLength="1000" required />
              </label>
              <label>
                Faculty guide
                <select
                  value={projectForm.guideEmail}
                  onChange={(event) => setProjectForm((previous) => ({ ...previous, guideEmail: event.target.value }))}
                  required
                >
                  <option value="">Select a guide</option>
                  {assignableUsers.guides.map((guide) => (
                    <option key={guide.email} value={guide.email}>{guide.name} · {guide.email}</option>
                  ))}
                </select>
              </label>
              <div className="project-member-field">
                <strong>Students · select exactly 3</strong>
                <div className="project-student-list" role="group" aria-label="Select exactly three students">
                  {assignableUsers.students.length ? assignableUsers.students.map((student) => {
                    const selected = projectForm.studentEmails.includes(student.email)
                    return (
                      <label className={`project-student-option ${selected ? 'selected' : ''}`} key={student.email}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!selected && projectForm.studentEmails.length >= 3}
                          onChange={(event) => handleProjectStudentSelection(student.email, event.target.checked)}
                        />
                        <span>
                          <strong>{student.name}</strong>
                          <small>{student.email}</small>
                        </span>
                      </label>
                    )
                  }) : <p className="project-roster-empty">No unassigned students available.</p>}
                </div>
                <span className="project-selection-count">{projectForm.studentEmails.length}/3 students selected</span>
                {assignableUsers.students.length < 3 && (
                  <span className="project-roster-notice" role="status">
                    {assignableUsers.students.length} unassigned student(s) available; add more student accounts to form a 3-student team.
                  </span>
                )}
              </div>
              <button type="submit" className="secondary-btn" disabled={projectLoading}>
                {projectLoading ? 'Creating project...' : 'Create project'}
              </button>
            </form>
          {projectError && <p className="inline-error" role="alert">{projectError}</p>}
          {projectMessage && <p className="success-notice project-notice">{projectMessage}</p>}
        </section>
      )}

      {currentUser.role === 'Guide' && (
        <section className="panel team-overview">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Your assigned projects and teams</p>
              <h2>{activeProject?.name || (guideTeams.length ? 'Assigned projects' : 'No team assigned')}</h2>
            </div>
          </div>
          {visibleGuideTeams.length ? (
            <div className="guide-team-list">
              {visibleGuideTeams.map((team) => (
                <article className="guide-team-summary" key={team.id}>
                  <div className="guide-team-heading">
                    <div>
                      <strong>{team.name}</strong>
                      <span>{projects.find((project) => project.id === team.projectId)?.name || 'Academic project'}</span>
                    </div>
                    <span className="pill">{team.stats?.progress || 0}%</span>
                  </div>
                  <p>{team.stats?.completed || 0} of {team.stats?.total || 0} tasks complete · {team.stats?.atRisk || 0} at risk</p>
                  <div className="project-progress"><span style={{ width: `${team.stats?.progress || 0}%` }} /></div>
                  <div className="student-roster">
                    {team.students.map((student) => <span className="student-chip" key={student.email}>{student.name}</span>)}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="empty-state">Ask the coordinator to assign you to a project team.</p>}
        </section>
      )}

      {currentUser.role === 'Student' && (
        <section className="panel team-overview">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Your academic project</p>
              <h2>Project status</h2>
            </div>
            <span className="pill">{studentTeams.length} team(s)</span>
          </div>
          {studentTeams.length ? (
            <div className="student-project-list">
              {studentTeams.map((team) => {
                const project = dashboardProjects.find((item) => item.id === team.projectId)
                const teamTasks = visibleTasks.filter((task) => task.teamId === team.id)
                const waitingForGuide = teamTasks.filter((task) => task.guideReviewStatus === 'Pending').length
                const waitingForCoordinator = teamTasks.filter((task) => task.coordinatorReviewStatus === 'Pending').length
                return (
                  <article className="student-project-card" key={team.id}>
                    <div className="student-project-heading">
                      <div>
                        <span className="project-status">{project?.status || 'In Progress'}</span>
                        <h3>{project?.name || team.name}</h3>
                      </div>
                      <strong>{team.stats?.progress || 0}%</strong>
                    </div>
                    <div className="project-progress"><span style={{ width: `${team.stats?.progress || 0}%` }} /></div>
                    <div className="student-project-metrics">
                      <span>{team.name}</span>
                      <span>Guide: {team.guide?.name || team.guideEmail}</span>
                      <span>{team.stats?.completed || 0}/{team.stats?.total || 0} tasks complete</span>
                      <span>{waitingForGuide} waiting for guide · {waitingForCoordinator} waiting for coordinator</span>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : <p className="empty-state">No project team has been assigned yet.</p>}
        </section>
      )}

      {currentUser.role !== 'Student' && (
        <section className="panel visualization-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Progress overview</p>
              <h2>{currentUser.role === 'Coordinator' ? 'Portfolio dashboard' : 'Team dashboard'}</h2>
            </div>
            <span className="pill">{currentUser.role === 'Coordinator' ? `${projects.length} projects` : `${visibleTasks.length} tasks`}</span>
          </div>

          <div className="visual-grid">
            <div className="visual-card primary-visual">
              <div
                className="progress-ring"
                style={{
                  background: `conic-gradient(#60a5fa ${currentUser.role === 'Coordinator'
                    ? ((projects.reduce((total, project) => total + (project.stats?.progress || 0), 0) / Math.max(projects.length, 1)) || 0)
                    : guideProgress}%, rgba(148, 163, 184, 0.14) 0)`,
                }}
              >
                <span>{currentUser.role === 'Coordinator'
                  ? Math.round(projects.reduce((total, project) => total + (project.stats?.progress || 0), 0) / Math.max(projects.length, 1))
                  : guideProgress}%</span>
              </div>
              <div className="visual-copy">
                <h3>{currentUser.role === 'Coordinator' ? 'Average project progress' : 'Team progress'}</h3>
                <p>
                  {currentUser.role === 'Coordinator'
                    ? `${projects.filter((project) => (project.stats?.progress || 0) >= 70).length} projects are moving ahead.`
                    : `${guideCompletedTasks} of ${guideTotalTasks} tasks completed across ${visibleGuideTeams.length} team(s).`}
                </p>
              </div>
            </div>

            <div className="visual-card">
              <h3>Status mix</h3>
              <div className="mini-bar-chart">
                {[
                  { label: 'To Do', count: visibleTasks.filter((task) => task.status === 'To Do').length },
                  { label: 'Queued', count: visibleTasks.filter((task) => task.status === 'Queued').length },
                  { label: 'In Progress', count: visibleTasks.filter((task) => task.status === 'In Progress').length },
                  { label: 'Review', count: visibleTasks.filter((task) => task.status === 'Review').length },
                  { label: 'At Risk', count: visibleTasks.filter((task) => task.status === 'At Risk').length },
                  { label: 'Done', count: visibleTasks.filter((task) => task.status === 'Completed').length },
                ].map((item) => (
                  <div key={item.label} className="chart-column">
                    <div className="bar-track">
                      <span
                        className="bar-fill"
                        style={{
                          height: `${visibleTasks.length ? (item.count / visibleTasks.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="visual-card">
              <h3>{currentUser.role === 'Coordinator' ? 'Project health' : 'Team focus'}</h3>
              <ul className="health-list">
                {(currentUser.role === 'Coordinator' ? projects : visibleGuideTeams.map((team) => ({ id: team.id, name: team.name, stats: team.stats }))).map((item) => (
                  <li key={item.id || item.name}>
                    <div className="health-row">
                      <span>{item.name}</span>
                      <strong>{item.stats?.progress || 0}%</strong>
                    </div>
                    <div className="project-progress"><span style={{ width: `${item.stats?.progress || 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <main className="content-grid">
        <section className="panel board-panel">
          <div className="panel-header">
            <h2>
              {currentUser.role === 'Student'
                ? 'My Task Board'
                : currentUser.role === 'Guide'
                  ? 'Guidance Queue'
                  : 'Team Task Board'}
            </h2>
            <span className="pill">{visibleTasks.length} active items</span>
          </div>

          <div className="task-filters">
            <label>
              Search tasks
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search title, owner, team..."
              />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option>All statuses</option>
                <option>Queued</option>
                <option>To Do</option>
                <option>In Progress</option>
                <option>Review</option>
                <option>At Risk</option>
                <option>Completed</option>
              </select>
            </label>
          </div>

          <div className="task-list">
            {filteredTasks.map((task) => (
              <article key={task.id} className="task-card">
                <div className="task-topline">
                  <span className={`status-badge ${statusClass(task.status)}`}>{task.status}</span>
                  <span className={`priority-badge ${priorityClass(task.priority)}`}>{task.priority}</span>
                </div>

                <h3>{task.title}</h3>
                <p>{task.description}</p>

                <div className="task-meta">
                  <span>Assigned to: {task.assignee}</span>
                  <span>Team: {task.team}</span>
                </div>

                <div className="review-chain" aria-label="Task review status">
                  <span><strong>Student submission</strong>{task.submittedAt ? 'Student submitted' : task.assignmentStatus === 'Queued' ? 'AI queued' : 'Not submitted'}</span>
                  <span><strong>Guide verification</strong>{task.guideReviewStatus === 'Changes updated' ? 'Guide verified' : task.guideReviewStatus || 'Not Submitted'}</span>
                  <span><strong>Coordinator review</strong>{task.coordinatorReviewStatus || 'Not Submitted'}</span>
                </div>

                <div className="progress-wrap">
                  <div className="progress-header">
                    <span>Progress</span>
                    <strong>{task.progress ?? 0}%</strong>
                  </div>
                  <div className="progress-bar">
                    <span style={{ width: `${task.progress || 0}%` }}></span>
                  </div>
                </div>

                {renderTaskMilestones(task)}

                {currentUser.role === 'Guide' && ['Pending', 'Verified with suggested changes', 'Changes updated'].includes(task.guideReviewStatus) && (
                  <div className="review-actions">
                    <span>Guide review options</span>
                    {task.guideReviewStatus === 'Verified with suggested changes' ? (
                      <button type="button" className="secondary-btn small-btn" onClick={() => handleTaskReview(task.id, 'Changes updated')}>
                        Changes updated
                      </button>
                    ) : (
                      <>
                        <button type="button" className="primary-btn small-btn" onClick={() => handleTaskReview(task.id, 'Verified')}>
                          Verified
                        </button>
                        <button type="button" className="secondary-btn small-btn" onClick={() => handleTaskReview(task.id, 'Verified with suggested changes')}>
                          Verified with suggested changes
                        </button>
                        <button type="button" className="secondary-btn small-btn" onClick={() => handleTaskReview(task.id, 'Changes updated')}>
                          Changes updated
                        </button>
                      </>
                    )}
                  </div>
                )}
                {currentUser.role === 'Coordinator' && ['Verified', 'Changes updated'].includes(task.guideReviewStatus) && task.coordinatorReviewStatus === 'Pending' && (
                  <div className="review-actions">
                    <span>Guide verified · awaiting coordinator review</span>
                    <button type="button" className="primary-btn small-btn" onClick={() => handleTaskReview(task.id, 'Reviewed')}>
                      Mark reviewed
                    </button>
                  </div>
                )}
                {currentUser.role === 'Student' && task.assignmentStatus === 'Queued' && task.status !== 'Completed' && (
                  <div className="review-actions">
                    <span>Assigned to your team; available after the previous week is reviewed.</span>
                  </div>
                )}
                {currentUser.role === 'Student' && task.assignmentStatus !== 'Queued' && task.status !== 'Completed'
                  && !['Pending', 'Verified', 'Changes updated'].includes(task.guideReviewStatus)
                  && task.coordinatorReviewStatus !== 'Reviewed' && (
                    <div className="review-actions">
                      <span>{task.guideReviewStatus === 'Not Done' ? 'Your guide returned this task.' : 'Ready to send your work to the guide.'}</span>
                      <button type="button" className="primary-btn small-btn" onClick={() => handleStudentTaskSubmit(task.id)}>
                        Submit to guide
                      </button>
                    </div>
                  )}

                <div className="task-footer">
                  <span>Due: {task.dueDate}</span>
                  <span>ID: {task.id}</span>
                </div>
                {currentUser.role === 'Coordinator' && (
                  <div className="task-deadline-control">
                    <label>
                      Task deadline
                      <input
                        type="date"
                        value={deadlineDrafts[task.id] ?? task.dueDate}
                        onChange={(event) => setDeadlineDrafts((previous) => ({ ...previous, [task.id]: event.target.value }))}
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-btn small-btn"
                      onClick={() => saveTaskDeadline(task.id)}
                      disabled={!deadlineDrafts[task.id] || deadlineDrafts[task.id] === task.dueDate}
                    >
                      Save deadline
                    </button>
                  </div>
                )}
                <div className="collaboration-block">
                  <h4>Documents</h4>
                  <ul className="attachment-list">
                    {tasks.filter((documentTask) => documentTask.teamId === task.teamId
                      && documentTask.projectId === task.projectId)
                      .flatMap((documentTask) => (documentTask.attachments || []).map((attachment) => ({
                        ...attachment,
                        taskTitle: documentTask.title,
                        teamName: documentTask.team,
                        uploader: attachment.uploadedBy || 'TaskFlow user',
                        uploaderRole: attachment.uploadedByRole || 'Student',
                      })))
                      .map((attachment) => (
                        <li key={attachment.id}>
                          <a href={`${API_URL.replace('/api', '')}${attachment.url}`} target="_blank" rel="noreferrer">
                            {attachment.name}
                          </a>
                          <span>
                            {attachment.teamName} · {attachment.taskTitle} · {attachment.uploaderRole}: {attachment.uploader} · {Math.max(1, Math.ceil(attachment.size / 1024))} KB
                          </span>
                        </li>
                      ))}
                  </ul>
                  {currentUser?.role === 'Student' && (
                    <label className="upload-control">
                      Attach PDF, PNG, JPEG, or TXT (max 5 MB)
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={(event) => handleAttachmentUpload(event, task.id)} />
                    </label>
                  )}
                </div>

                <div className="collaboration-block" id={`task-${task.id}-feedback`}>
                  <h4>{currentUser.role === 'Coordinator' ? 'Coordinator feedback' : currentUser.role === 'Guide' ? 'Guide feedback' : 'Team feedback'}</h4>
                  <ul className="comment-list">
                    {(task.comments || []).map((comment) => (
                      <li key={comment.id}>
                        <strong>{comment.author}</strong>
                        {comment.role && <span className="comment-role">{comment.role}</span>}
                        <p>{comment.text}</p>
                        <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
                      </li>
                    ))}
                  </ul>
                  <form className="feedback-form" onSubmit={(event) => handleFeedbackSubmit(event, task.id)}>
                    <textarea
                      value={feedbackDrafts[task.id] || ''}
                      onChange={(event) => setFeedbackDrafts((previous) => ({ ...previous, [task.id]: event.target.value }))}
                      placeholder={currentUser.role === 'Student' ? 'Share a progress update or blocker...' : 'Share feedback, a suggestion, or review note...'}
                      maxLength="2000"
                      rows="2"
                    />
                    <button type="submit" className="secondary-btn small-btn" disabled={!(feedbackDrafts[task.id] || '').trim()}>
                      Add feedback
                    </button>
                  </form>
                </div>
              </article>
            ))}
            {!filteredTasks.length && <p className="empty-state">No tasks match this view. Try another search or status filter.</p>}
          </div>
        </section>

        <aside className="side-panel">
          <DeadlineCalendar tasks={calendarTasks} />
          {['Guide', 'Coordinator', 'Student'].includes(currentUser.role) && (
            <section className="panel assistant-panel" id="workflow-assistant">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">AI assistant</p>
                  <h2>TaskFlow Agent</h2>
                </div>
              </div>
              <p className="agent-description">{currentUser.role === 'Student'
                ? 'Get guidance on your assigned weekly milestones, deadlines, and feedback.'
                : 'Review weekly workload, deadlines, and blockers.'}</p>
              <form className="agent-form" onSubmit={handleAgentSubmit}>
                <textarea
                  value={agentPrompt}
                  onChange={(event) => setAgentPrompt(event.target.value)}
                  placeholder={currentUser.role === 'Student'
                    ? 'Ask about your task, milestone, deadline, or feedback...'
                    : 'What needs attention on this project?'}
                  maxLength="500"
                  rows="3"
                  required
                />
                <button type="submit" className="primary-btn" disabled={agentLoading}>
                  {agentLoading ? 'Reviewing milestones...' : currentUser.role === 'Student' ? 'Ask about my milestones' : 'Ask agent'}
                </button>
              </form>
              {agentError && <p className="inline-error" role="alert">{agentError}</p>}
              {agentPlan && (
                <div className="agent-plan" aria-live="polite">
                  <p>{agentPlan.summary}</p>
                  {agentPlan.actions.length > 0 && (
                    <ul className="agent-action-list">
                      {agentPlan.actions.map((action, index) => (
                        <li key={`${action.sourceTaskId || action.title}-${index}`}>
                          <div className="agent-action">
                            <span>
                              <strong>{action.title}</strong>
                              <small>{action.rationale}{action.dueDate ? ` · due ${action.dueDate}` : ''}</small>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
          <section className="panel weekly-overview">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Weekly plan</p>
                <h2>Milestone progress</h2>
              </div>
            </div>
            <ul className="health-list">
              {milestoneProgressTasks.map((task) => (
                <li key={task.id}>
                  <div className="health-row">
                    <span>{task.title}</span>
                    <strong>{task.progress || 0}%</strong>
                  </div>
                  <div className="project-progress"><span style={{ width: `${task.progress || 0}%` }} /></div>
                  <small>{workflowStatus(task)} · due {task.dueDate}</small>
                  {currentUser?.role === 'Coordinator' && task.milestones?.some((week) => week.feedbacks?.some((feedback) => feedback.role === 'Guide')) && (
                    <div className="milestone-suggestions">
                      {task.milestones.map((week, weekIndex) => {
                        const guideSuggestions = (week.feedbacks || []).filter((feedback) => feedback.role === 'Guide')
                        if (!guideSuggestions.length) return null

                        return (
                          <section key={week.week}>
                            <strong>Week {week.week} guide suggestions</strong>
                            {guideSuggestions.map((feedback) => (
                              <div className="milestone-suggestion-entry" key={feedback.id}>
                                <p>{feedback.text}</p>
                                <div className="suggestion-documents">
                                  {(task.attachments || []).map((attachment) => (
                                    <a
                                      key={attachment.id}
                                      href={`${API_URL.replace('/api', '')}${attachment.url}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      View {attachment.name}
                                    </a>
                                  ))}
                                  {!(task.attachments || []).length && <span>No task document attached.</span>}
                                </div>
                                {feedback.coordinatorReviewed ? (
                                  <span className="week-mark-status completed">Reviewed</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="secondary-btn small-btn milestone-feedback-btn"
                                    onClick={() => handleMilestoneFeedbackReview(task.id, weekIndex, feedback.id)}
                                  >
                                    Mark reviewed
                                  </button>
                                )}
                              </div>
                            ))}
                          </section>
                        )
                      })}
                    </div>
                  )}
                </li>
              ))}
              {!milestoneProgressTasks.length && <li className="empty-state">No assigned weekly milestones.</li>}
            </ul>
          </section>
        </aside>
      </main>

    </div>
  )
}

export default App
