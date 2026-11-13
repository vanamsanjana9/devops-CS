const Task = require("../models/Task");

const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      project,
      assignedTo,
      assignedBy,
      priority,
      deadline,
    } = req.body;

    const task = new Task({
      title,
      description,
      project,
      assignedTo,
      assignedBy,
      priority,
      deadline,
    });

    const savedTask = await task.save();

    res.status(201).json({
      message: "Task created successfully",
      task: savedTask,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create task",
      error: error.message,
    });
  }
};

const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("project", "title")
      .populate("assignedTo", "name email role")
      .populate("assignedBy", "name email role");

    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch tasks",
      error: error.message,
    });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.status(200).json({
      message: "Task status updated successfully",
      task,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update task status",
      error: error.message,
    });
  }
};

module.exports = {
  createTask,
  getTasks,
  updateTaskStatus,
};