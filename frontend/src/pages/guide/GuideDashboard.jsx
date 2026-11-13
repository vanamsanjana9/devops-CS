import { useEffect, useState } from "react";
import axios from "axios";

function GuideDashboard() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [feedbackText, setFeedbackText] = useState({});
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");

  const guideId = "6aaa5e021adcb3c35b587360";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projectResponse = await axios.get(
          "http://localhost:5000/api/projects"
        );

        const taskResponse = await axios.get(
          "http://localhost:5000/api/tasks"
        );

        const submissionResponse = await axios.get(
          "http://localhost:5000/api/submissions"
        );

        setProjects(projectResponse.data);
        setTasks(taskResponse.data);
        setSubmissions(submissionResponse.data);
      } catch (error) {
        console.log("Failed to fetch data:", error);
      }
    };

    fetchData();
  }, []);

  const generateAITasks = async () => {
    if (!selectedProject) {
      alert("Please select a project.");
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/ai/generate-tasks",
        {
          projectId: selectedProject,
        }
      );

      alert(response.data.message);

      const taskResponse = await axios.get(
        "http://localhost:5000/api/tasks"
      );

      setTasks(taskResponse.data);
    } catch (error) {
      console.log("AI Task Error:", error);

      alert(
        error.response?.data?.message ||
          "Failed to generate AI tasks"
      );
    }
  };

  const analyzeProgress = async () => {
    if (!selectedProject) {
      alert("Please select a project.");
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/ai/analyze-progress",
        {
          projectId: selectedProject,
        }
      );

      const analysis = JSON.parse(response.data.result);

      setAiAnalysis(analysis);

      alert("AI project analysis completed!");
    } catch (error) {
      console.log("AI Analysis Error:", error);

      alert(
        error.response?.data?.message ||
          "Failed to analyze project progress"
      );
    }
  };

  const giveFeedback = async (submissionId) => {
    const comments = feedbackText[submissionId];

    if (!comments || !comments.trim()) {
      alert("Please enter feedback.");
      return;
    }

    try {
      await axios.post(
        "http://localhost:5000/api/feedback",
        {
          submission: submissionId,
          guide: guideId,
          comments: comments,
        }
      );

      alert("Feedback created successfully!");

      setFeedbackText({
        ...feedbackText,
        [submissionId]: "",
      });
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Failed to create feedback"
      );
    }
  };

  return (
    <div>
      <h1>TaskFlow</h1>

      <h2>Guide Dashboard</h2>

      <p>Welcome to your guide dashboard.</p>

      <hr />

      <h3>Agentic AI</h3>

      <p>
        Use Agentic AI to generate project tasks and
        analyze project progress.
      </p>

      <label>Select Project:</label>

      <br />

      <select
        value={selectedProject}
        onChange={(e) =>
          setSelectedProject(e.target.value)
        }
      >
        <option value="">
          Select a project
        </option>

        {projects.map((project) => (
          <option
            key={project._id}
            value={project._id}
          >
            {project.title}
          </option>
        ))}
      </select>

      <br />
      <br />

      <button onClick={generateAITasks}>
        Generate Tasks with AI
      </button>

      <br />
      <br />

      <button onClick={analyzeProgress}>
        Analyze Project with AI
      </button>

      {aiAnalysis && (
        <div>
          <hr />

          <h3>AI Analysis</h3>

          <h4>
            Overall Status:{" "}
            {aiAnalysis.overall_status}
          </h4>

          <h4>Progress Summary</h4>

          <p>
            {aiAnalysis.progress_summary}
          </p>

          <h4>Pending Tasks</h4>

          {aiAnalysis.pending_tasks.length === 0 ? (
            <p>No pending tasks.</p>
          ) : (
            <ul>
              {aiAnalysis.pending_tasks.map(
                (task, index) => (
                  <li key={index}>{task}</li>
                )
              )}
            </ul>
          )}

          <h4>Delay Risks</h4>

          {aiAnalysis.delay_risks.length === 0 ? (
            <p>
              No major delay risks identified.
            </p>
          ) : (
            <ul>
              {aiAnalysis.delay_risks.map(
                (risk, index) => (
                  <li key={index}>{risk}</li>
                )
              )}
            </ul>
          )}

          <h4>AI Recommendations</h4>

          {aiAnalysis.recommendations.length === 0 ? (
            <p>No recommendations.</p>
          ) : (
            <ul>
              {aiAnalysis.recommendations.map(
                (recommendation, index) => (
                  <li key={index}>
                    {recommendation}
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}

      <hr />

      <h3>My Projects</h3>

      {projects.length === 0 ? (
        <p>No projects available.</p>
      ) : (
        projects.map((project) => (
          <div
            key={project._id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "15px",
              borderRadius: "8px",
            }}
          >
            <h4>{project.title}</h4>

            <p>
              <strong>Description:</strong>{" "}
              {project.description}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {project.status}
            </p>

            <p>
              <strong>Guide:</strong>{" "}
              {project.guide?.name || "N/A"}
            </p>

            <p>
              <strong>Students:</strong>{" "}
              {project.students?.length > 0
                ? project.students
                    .map((student) => student.name)
                    .join(", ")
                : "No students assigned"}
            </p>

            <p>
              <strong>Start Date:</strong>{" "}
              {project.startDate
                ? new Date(
                    project.startDate
                  ).toLocaleDateString()
                : "Not set"}
            </p>

            <p>
              <strong>Deadline:</strong>{" "}
              {project.deadline
                ? new Date(
                    project.deadline
                  ).toLocaleDateString()
                : "Not set"}
            </p>
          </div>
        ))
      )}

      <hr />

      <h3>Tasks</h3>

      {tasks.length === 0 ? (
        <p>No tasks available.</p>
      ) : (
        tasks.map((task) => (
          <div
            key={task._id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "15px",
              borderRadius: "8px",
            }}
          >
            <h4>{task.title}</h4>

            <p>
              <strong>Description:</strong>{" "}
              {task.description}
            </p>

            <p>
              <strong>Project:</strong>{" "}
              {task.project?.title || "N/A"}
            </p>

            <p>
              <strong>Assigned Student:</strong>{" "}
              {task.assignedTo?.name ||
                "Not assigned"}
            </p>

            <p>
              <strong>Priority:</strong>{" "}
              {task.priority}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {task.status}
            </p>

            <p>
              <strong>Deadline:</strong>{" "}
              {task.deadline
                ? new Date(
                    task.deadline
                  ).toLocaleDateString()
                : "Not set"}
            </p>
          </div>
        ))
      )}

      <hr />

      <h3>Student Submissions</h3>

      {submissions.length === 0 ? (
        <p>No submissions available.</p>
      ) : (
        submissions.map((submission) => (
          <div
            key={submission._id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "15px",
              borderRadius: "8px",
            }}
          >
            <h4>
              Task: {submission.task?.title}
            </h4>

            <p>
              <strong>Student:</strong>{" "}
              {submission.student?.name}
            </p>

            <p>
              <strong>Email:</strong>{" "}
              {submission.student?.email}
            </p>

            <p>
              <strong>Submission:</strong>{" "}
              {submission.content}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {submission.status}
            </p>

            <label>Give Feedback:</label>

            <br />

            <textarea
              placeholder="Enter your feedback"
              value={
                feedbackText[submission._id] || ""
              }
              onChange={(e) =>
                setFeedbackText({
                  ...feedbackText,
                  [submission._id]:
                    e.target.value,
                })
              }
              rows="4"
              cols="50"
            />

            <br />
            <br />

            <button
              onClick={() =>
                giveFeedback(
                  submission._id
                )
              }
            >
              Give Feedback
            </button>
          </div>
        ))
      )}

      <hr />

      <h3>Team Progress</h3>

      <p>Track student team progress.</p>

      <h3>Feedback</h3>

      <p>
        Review student submissions and provide
        feedback.
      </p>
    </div>
  );
}

export default GuideDashboard;