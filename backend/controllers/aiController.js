const Project = require("../models/Project");
const Task = require("../models/Task");
const Notification = require("../models/Notification");

const {
  generateProjectTasks,
  analyzeProjectProgress,
} = require("../ai/aiService");

const generateTasks = async (req, res) => {
  try {
    const { projectId } = req.body;

    const project = await Project.findById(projectId)
      .populate("guide", "name email")
      .populate("students", "name email");

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    if (!project.students || project.students.length === 0) {
      return res.status(400).json({
        message: "No students assigned to this project",
      });
    }

    const existingTasks = await Task.find({
      project: projectId,
    });

    if (existingTasks.length > 0) {
      return res.status(400).json({
        message:
          "Tasks have already been generated for this project.",
      });
    }

    if (!project.startDate || !project.deadline) {
      return res.status(400).json({
        message:
          "Project start date and deadline are required before generating AI tasks.",
      });
    }

    const projectStartDate = new Date(project.startDate);
    const projectDeadline = new Date(project.deadline);

    const aiResult = await generateProjectTasks(project);

    const generatedTasks = JSON.parse(aiResult);

    if (
      !Array.isArray(generatedTasks) ||
      generatedTasks.length === 0
    ) {
      return res.status(400).json({
        message:
          "AI did not generate valid tasks.",
      });
    }

    const createdTasks = [];

    for (let i = 0; i < generatedTasks.length; i++) {
      const aiTask = generatedTasks[i];

      if (
        !aiTask.task_title ||
        !aiTask.task_description ||
        !aiTask.priority ||
        !aiTask.suggested_deadline
      ) {
        return res.status(400).json({
          message:
            "AI generated an incomplete task.",
        });
      }

      const taskDeadline = new Date(
        aiTask.suggested_deadline
      );

      if (isNaN(taskDeadline.getTime())) {
        return res.status(400).json({
          message:
            `Invalid deadline generated for task: ${aiTask.task_title}`,
        });
      }

      if (
        taskDeadline < projectStartDate ||
        taskDeadline > projectDeadline
      ) {
        return res.status(400).json({
          message:
            `AI generated an invalid deadline for task: ${aiTask.task_title}. ` +
            "Task deadlines must be between the project start date and project deadline.",
        });
      }

      if (
        !["Low", "Medium", "High"].includes(
          aiTask.priority
        )
      ) {
        return res.status(400).json({
          message:
            `Invalid priority generated for task: ${aiTask.task_title}`,
        });
      }

      const student =
        project.students[
          i % project.students.length
        ];

      const task = new Task({
        title: aiTask.task_title,
        description: aiTask.task_description,
        project: project._id,
        assignedTo: student._id,
        assignedBy: project.guide._id,
        priority: aiTask.priority,
        deadline: aiTask.suggested_deadline,
      });

      const savedTask = await task.save();

      createdTasks.push(savedTask);

      await Notification.create({
        user: student._id,
        message:
          `New AI task assigned: ${aiTask.task_title}. ` +
          `Priority: ${aiTask.priority}. ` +
          `Deadline: ${aiTask.suggested_deadline}.`,
        type: "Task",
        isRead: false,
      });
    }

    res.status(201).json({
      message:
        "AI tasks generated, assigned, and notifications created successfully",
      tasks: createdTasks,
    });
  } catch (error) {
    console.log("AI Error:", error.message);

    res.status(500).json({
      message: "Failed to generate AI tasks",
      error: error.message,
    });
  }
};

const analyzeProgress = async (req, res) => {
  try {
    const { projectId } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const tasks = await Task.find({
      project: projectId,
    });

    const aiResult = await analyzeProjectProgress(
      project,
      tasks
    );

    res.status(200).json({
      message:
        "Project progress analyzed successfully",
      result: aiResult,
    });
  } catch (error) {
    console.log(
      "AI Progress Error:",
      error.message
    );

    res.status(500).json({
      message:
        "Failed to analyze project progress",
      error: error.message,
    });
  }
};

module.exports = {
  generateTasks,
  analyzeProgress,
};