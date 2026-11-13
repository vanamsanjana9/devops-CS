const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['Coordinator', 'Guide', 'Student'],
      default: 'Student',
    },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
