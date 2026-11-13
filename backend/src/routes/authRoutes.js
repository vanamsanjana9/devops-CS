const express = require('express');
const User = require('../models/User');

const router = express.Router();

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, ...safeUser } = user.toObject ? user.toObject() : user;
  return safeUser;
};

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();
    const normalizedRole = ['Coordinator', 'Guide', 'Student'].includes(role) ? role : 'Student';

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const newUser = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: String(password),
      role: normalizedRole,
    });
    return res.status(201).json({ user: sanitizeUser(newUser) });
  } catch (error) {
    return res.status(500).json({ message: 'Registration failed.', error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || user.password !== String(password)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and new password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const newPassword = String(password).trim();
    if (!newPassword) {
      return res.status(400).json({ message: 'Password cannot be empty.' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'No account found for that email.' });
    }

    user.password = newPassword;
    await user.save();
    return res.json({ message: 'Password reset successful.' });
  } catch (error) {
    return res.status(500).json({ message: 'Password reset failed.', error: error.message });
  }
});

module.exports = router;
