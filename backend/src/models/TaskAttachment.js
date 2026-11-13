const mongoose = require('mongoose');

const taskAttachmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  taskId: { type: String, default: '' },
  name: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: { type: String, default: '' },
  uploadedByRole: { type: String, default: '' },
  data: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.models.TaskAttachment
  || mongoose.model('TaskAttachment', taskAttachmentSchema);