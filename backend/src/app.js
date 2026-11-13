const express = require('express');
const cors = require('cors');
const TaskAttachment = require('./models/TaskAttachment');
const taskRoutes = require('./routes/taskRoutes');
const aiRoutes = require('./routes/aiRoutes');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const messageRoutes = require('./routes/messageRoutes');
const { refreshDashboardState } = require('./data/mockData');

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/uploads/:fileName', async (req, res, next) => {
  try {
    const attachmentId = req.params.fileName.replace(/\.[^.]+$/, '');
    const attachment = await TaskAttachment.findOne({ id: attachmentId }).lean();
    if (!attachment) return res.status(404).json({ message: 'Attachment not found.' });
    const storedData = attachment.data;
    const buffer = Buffer.isBuffer(storedData)
      ? storedData
      : Buffer.from(storedData.buffer).subarray(0, storedData.position);
    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.name.replace(/["\r\n]/g, '')}"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/health', (req, res) => {
  const connected = require('mongoose').connection.readyState === 1;
  res.json({
    status: connected ? 'ok' : 'unavailable',
    app: 'TaskFlow API',
    mode: connected ? 'mongodb' : 'unavailable'
  });
});

app.use('/api', async (req, res, next) => {
  try {
    await refreshDashboardState();
    return next();
  } catch (error) {
    return next(error);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);

app.use('/api', (req, res) => {
  return res.status(404).json({
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong on the server.',
    error: err.message
  });
});

module.exports = app;
