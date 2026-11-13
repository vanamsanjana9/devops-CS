const mongoose = require('mongoose');

async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taskflow';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully.');
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection failed; TaskFlow requires database storage.');
    throw error;
  }
}

module.exports = connectDB;
