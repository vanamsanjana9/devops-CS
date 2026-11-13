const express = require("express");

const router = express.Router();

const {
  createFeedback,
  getFeedback,
} = require("../controllers/feedbackController");

router.post("/", createFeedback);

router.get("/", getFeedback);

module.exports = router;