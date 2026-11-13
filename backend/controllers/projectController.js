const Project = require("../models/Project");

const createProject = async (req, res) => {
  try {
    const { title, description, guide, students, startDate, deadline } = req.body;

    const project = new Project({
      title,
      description,
      guide,
      students,
      startDate,
      deadline,
    });

    const savedProject = await project.save();

    res.status(201).json({
      message: "Project created successfully",
      project: savedProject,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create project",
      error: error.message,
    });
  }
};

const getProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate("guide", "name email role")
      .populate("students", "name email role");

    res.status(200).json(projects);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch projects",
      error: error.message,
    });
  }
};

module.exports = {
  createProject,
  getProjects,
};