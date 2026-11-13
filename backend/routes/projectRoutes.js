const express = require("express");

const router = express.Router();

const {
  createProject,
  getProjects,
} = require("../controllers/projectController");

router.post("/", createProject);

router.get("/", getProjects);

module.exports = router;