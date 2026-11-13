const express = require("express");

const router = express.Router();

const {
  generateTasks,
  analyzeProgress,
} = require("../controllers/aiController");

router.post("/generate-tasks", generateTasks);

router.post("/analyze-progress", analyzeProgress);

module.exports = router;