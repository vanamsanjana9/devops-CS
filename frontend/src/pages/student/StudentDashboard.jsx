import { useEffect, useState } from "react";
import axios from "axios";

function StudentDashboard() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [submissionContent, setSubmissionContent] = useState("");

  const studentId = "6aa52b20ef26fbe4004be64a";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projectResponse = await axios.get(
          "http://localhost:5000/api/projects"
        );

        const taskResponse = await axios.get(
          "http://localhost:5000/api/tasks"
        );

        const notificationResponse = await axios.get(
          `http://localhost:5000/api/notifications/${studentId}`
        );

        const submissionResponse = await axios.get(
          "http://localhost:5000/api/submissions"
        );

        const feedbackResponse = await axios.get(
          "http://localhost:5000/api/feedback"
        );

        setProjects(projectResponse.data);
        setTasks(taskResponse.data);
        setNotifications(notificationResponse.data);
        setSubmissions(submissionResponse.data);
        setFeedback(feedbackResponse.data);
      } catch (error) {
        console.log("Failed to fetch data:", error);
      }
    };

    fetchData();
  }, []);

  const updateStatus = async (taskId, status) => {
    try {
      await axios.put(
        `http://localhost:5000/api/tasks/${taskId}/status`,
        {
          status: status,
        }
      );

      setTasks(
        tasks.map((task) =>
          task._id === taskId
            ? { ...task, status: status }
            : task
        )
      );

      alert("Task status updated successfully!");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Failed to update task status"
      );
    }
  };

  const submitTask = async (taskId) => {
    if (!submissionContent.trim()) {
      alert("Please enter your submission.");
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/submissions",
        {
          task: taskId,
          student: studentId,
          content: submissionContent,
        }
      );

      setSubmissions([
        ...submissions,
        response.data.submission,
      ]);

      setSubmissionContent("");

      alert("Submission created successfully!");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Failed to submit task"
      );
    }
  };

  const markNotificationAsRead = async (
    notificationId
  ) => {
    try {
      await axios.put(
        `http://localhost:5000/api/notifications/${notificationId}/read`
      );

      setNotifications(
        notifications.map((notification) =>
          notification._id === notificationId
            ? {
                ...notification,
                isRead: true,
              }
            : notification
        )
      );
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Failed to mark notification as read"
      );
    }
  };

  return (
    <div>
      <h1>TaskFlow</h1>

      <h2>Student Dashboard</h2>

      <p>Welcome to your TaskFlow dashboard.</p>

      <h3>My Projects</h3>

      {projects.length === 0 ? (
        <p>No projects available.</p>
      ) : (
        projects.map((project) => (
          <div key={project._id}>
            <h4>{project.title}</h4>

            <p>{project.description}</p>

            <p>Status: {project.status}</p>

            <hr />
          </div>
        ))
      )}

      <h3>My Tasks</h3>

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
              <strong>Priority:</strong>{" "}
              {task.priority}
            </p>

            <p>
              <strong>Deadline:</strong>{" "}
              {task.deadline
                ? new Date(
                    task.deadline
                  ).toLocaleDateString()
                : "Not set"}
            </p>

            <p>
              <strong>Current Status:</strong>{" "}
              {task.status}
            </p>

            <label>Update Status: </label>

            <select
              value={task.status}
              onChange={(e) =>
                updateStatus(
                  task._id,
                  e.target.value
                )
              }
            >
              <option value="Pending">
                Pending
              </option>

              <option value="In Progress">
                In Progress
              </option>

              <option value="Completed">
                Completed
              </option>
            </select>

            <br />
            <br />

            <label>
              <strong>Submit Task:</strong>
            </label>

            <br />

            <textarea
              placeholder="Enter your submission"
              value={submissionContent}
              onChange={(e) =>
                setSubmissionContent(
                  e.target.value
                )
              }
              rows="4"
              cols="50"
            />

            <br />
            <br />

            <button
              onClick={() =>
                submitTask(task._id)
              }
            >
              Submit Task
            </button>
          </div>
        ))
      )}

      <h3>My Submissions</h3>

      {submissions.length === 0 ? (
        <p>No submissions available.</p>
      ) : (
        submissions
          .filter(
            (submission) =>
              submission.student?._id ===
                studentId ||
              submission.student === studentId
          )
          .map((submission) => (
            <div key={submission._id}>
              <h4>
                Task: {submission.task?.title}
              </h4>

              <p>
                <strong>Submission:</strong>{" "}
                {submission.content}
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {submission.status}
              </p>

              <hr />
            </div>
          ))
      )}

      <h3>Guide Feedback</h3>

      {feedback.length === 0 ? (
        <p>No feedback available.</p>
      ) : (
        feedback.map((item) => (
          <div key={item._id}>
            <p>
              <strong>Guide:</strong>{" "}
              {item.guide?.name}
            </p>

            <p>
              <strong>Feedback:</strong>{" "}
              {item.comments}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {item.status}
            </p>

            <hr />
          </div>
        ))
      )}

      <h3>Notifications</h3>

      {notifications.length === 0 ? (
        <p>No notifications available.</p>
      ) : (
        notifications.map((notification) => (
          <div
            key={notification._id}
            style={{
              border: "1px solid #ccc",
              padding: "15px",
              marginBottom: "15px",
              borderRadius: "8px",
            }}
          >
            <p>
              <strong>Message:</strong>{" "}
              {notification.message}
            </p>

            <p>
              <strong>Type:</strong>{" "}
              {notification.type}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {notification.isRead
                ? "Read"
                : "Unread"}
            </p>

            {!notification.isRead && (
              <button
                onClick={() =>
                  markNotificationAsRead(
                    notification._id
                  )
                }
              >
                Mark as Read
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default StudentDashboard;