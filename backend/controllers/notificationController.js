const Notification = require("../models/Notification");

const createNotification = async (req, res) => {
  try {
    const { user, message, type } = req.body;

    const notification = new Notification({
      user,
      message,
      type,
    });

    const savedNotification = await notification.save();

    res.status(201).json({
      message: "Notification created successfully",
      notification: savedNotification,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create notification",
      error: error.message,
    });
  }
};

const getNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    const notifications = await Notification.find({
      user: userId,
    }).sort({ createdAt: -1 });

    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    notification.isRead = true;

    const updatedNotification =
      await notification.save();

    res.status(200).json({
      message: "Notification marked as read",
      notification: updatedNotification,
    });
  } catch (error) {
    res.status(500).json({
      message:
        "Failed to mark notification as read",
      error: error.message,
    });
  }
};

module.exports = {
  createNotification,
  getNotifications,
  markNotificationAsRead,
};