const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    submission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },

    guide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    comments: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["Reviewed"],
      default: "Reviewed",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Feedback", feedbackSchema);