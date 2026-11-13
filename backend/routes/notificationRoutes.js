const express = require("express");

const router = express.Router();

const {
  createNotification,
  getNotifications,
  markNotificationAsRead,
} = require("../controllers/notificationController");

router.post("/", createNotification);

router.get("/:userId", getNotifications);

router.put("/:id/read", markNotificationAsRead);

module.exports = router;