const mongoose = require('mongoose');

const dashboardStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  tasks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  projects: { type: [mongoose.Schema.Types.Mixed], default: [] },
  teams: { type: [mongoose.Schema.Types.Mixed], default: [] },
  messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
  notifications: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.DashboardState
  || mongoose.model('DashboardState', dashboardStateSchema);