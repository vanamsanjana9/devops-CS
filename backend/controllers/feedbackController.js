const Feedback = require("../models/Feedback");
const Submission = require("../models/Submission");
const Notification = require("../models/Notification");

const createFeedback = async (req, res) => {
  try {
    const { submission, guide, comments } = req.body;

    const savedSubmission = await Submission.findById(submission);

    if (!savedSubmission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    const feedback = new Feedback({
      submission,
      guide,
      comments,
    });

    const savedFeedback = await feedback.save();

    await Notification.create({
      user: savedSubmission.student,
      message: "Your submission has received new feedback from the guide.",
      type: "Feedback",
    });

    res.status(201).json({
      message: "Feedback created successfully",
      feedback: savedFeedback,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create feedback",
      error: error.message,
    });
  }
};

const getFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find()
      .populate("submission")
      .populate("guide", "name email");

    res.status(200).json(feedback);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch feedback",
      error: error.message,
    });
  }
};

module.exports = {
  createFeedback,
  getFeedback,
};