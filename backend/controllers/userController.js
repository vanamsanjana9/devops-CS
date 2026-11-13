const mongoose = require("mongoose");

const getUsers = async (req, res) => {
  try {
    const User = mongoose.model("User");

    const users = await User.find().select("-password");

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

module.exports = {
  getUsers,
};