const Submission = require("../models/Submission");

const createSubmission = async (req, res) => {
  try {
    const { task, student, content } = req.body;

    const submission = new Submission({
      task,
      student,
      content,
    });

    const savedSubmission = await submission.save();

    res.status(201).json({
      message: "Submission created successfully",
      submission: savedSubmission,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create submission",
      error: error.message,
    });
  }
};

const getSubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find()
      .populate("task", "title description")
      .populate("student", "name email");

    res.status(200).json(submissions);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch submissions",
      error: error.message,
    });
  }
};

module.exports = {
  createSubmission,
  getSubmissions,
};