import { useEffect, useState } from "react";
import axios from "axios";

function AdminDashboard() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [guide, setGuide] = useState("");
  const [students, setStudents] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const projectResponse = await axios.get(
          "http://localhost:5000/api/projects"
        );

        const userResponse = await axios.get(
          "http://localhost:5000/api/users"
        );

        setProjects(projectResponse.data);
        setUsers(userResponse.data);
      } catch (error) {
        console.log("Failed to fetch data:", error);
      }
    };

    fetchData();
  }, []);

  const createProject = async (e) => {
    e.preventDefault();

    if (!guide) {
      alert("Please select a guide.");
      return;
    }

    if (students.length === 0) {
      alert("Please select at least one student.");
      return;
    }

    try {
      const response = await axios.post(
        "http://localhost:5000/api/projects",
        {
          title,
          description,
          guide,
          students,
          startDate,
          deadline,
        }
      );

      setProjects([...projects, response.data.project]);

      setTitle("");
      setDescription("");
      setGuide("");
      setStudents([]);
      setStartDate("");
      setDeadline("");

      alert("Project created successfully!");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Failed to create project"
      );
    }
  };

  const handleStudentSelection = (e) => {
    const selectedStudents = Array.from(
      e.target.selectedOptions,
      (option) => option.value
    );

    setStudents(selectedStudents);
  };

  const guides = users.filter(
    (user) => user.role === "guide"
  );

  const studentUsers = users.filter(
    (user) => user.role === "student"
  );

  return (
    <div>
      <h1>TaskFlow</h1>

      <h2>Admin Dashboard</h2>

      <p>Welcome to the admin dashboard.</p>

      <h3>Create Project</h3>

      <form onSubmit={createProject}>
        <div>
          <label>Project Title</label>

          <br />

          <input
            type="text"
            placeholder="Enter project title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <br />

        <div>
          <label>Description</label>

          <br />

          <textarea
            placeholder="Enter project description"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            rows="4"
            cols="50"
            required
          />
        </div>

        <br />

        <div>
          <label>Select Guide</label>

          <br />

          <select
            value={guide}
            onChange={(e) => setGuide(e.target.value)}
            required
          >
            <option value="">
              Select a guide
            </option>

            {guides.map((user) => (
              <option
                key={user._id}
                value={user._id}
              >
                {user.name} - {user.email}
              </option>
            ))}
          </select>
        </div>

        <br />

        <div>
          <label>Select Students</label>

          <br />

          <select
            multiple
            value={students}
            onChange={handleStudentSelection}
            size="5"
          >
            {studentUsers.map((user) => (
              <option
                key={user._id}
                value={user._id}
              >
                {user.name} - {user.email}
              </option>
            ))}
          </select>

          <p>
            Hold Ctrl and select multiple students.
          </p>
        </div>

        <br />

        <div>
          <label>Start Date</label>

          <br />

          <input
            type="date"
            value={startDate}
            onChange={(e) =>
              setStartDate(e.target.value)
            }
          />
        </div>

        <br />

        <div>
          <label>Deadline</label>

          <br />

          <input
            type="date"
            value={deadline}
            onChange={(e) =>
              setDeadline(e.target.value)
            }
          />
        </div>

        <br />

        <button type="submit">
          Create Project
        </button>
      </form>

      <hr />

      <h3>Users</h3>

      {users.length === 0 ? (
        <p>No users available.</p>
      ) : (
        users.map((user) => (
          <div key={user._id}>
            <h4>{user.name}</h4>

            <p>Email: {user.email}</p>

            <p>Role: {user.role}</p>

            <hr />
          </div>
        ))
      )}

      <h3>Projects</h3>

      {projects.length === 0 ? (
        <p>No projects available.</p>
      ) : (
        projects.map((project) => (
          <div key={project._id}>
            <h4>{project.title}</h4>

            <p>{project.description}</p>

            <p>Status: {project.status}</p>

            <p>
              Guide: {project.guide?.name}
            </p>

            <p>
              Students:{" "}
              {project.students?.map((student) => student.name).join(", ")}
            </p>

            <p>
              Start Date: {project.startDate}
            </p>

            <p>
              Deadline: {project.deadline}
            </p>

            <hr />
          </div>
        ))
      )}

      <h3>Teams</h3>

      <p>Manage project teams.</p>

      <h3>System Overview</h3>

      <p>Monitor overall TaskFlow activity.</p>
    </div>
  );
}

export default AdminDashboard;