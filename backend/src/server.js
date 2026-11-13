const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./config/db');
const TaskAttachment = require('./models/TaskAttachment');
const { initializeDashboardState, getTasks } = require('./data/mockData');

const PORT = process.env.PORT || 5000;
const uploadDirectory = path.resolve(__dirname, '../uploads');

async function migrateLegacyUploads() {
  let fileNames;
  try {
    fileNames = await fs.readdir(uploadDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  const attachmentReferences = new Map(getTasks().flatMap((task) =>
    (task.attachments || []).map((attachment) => [attachment.id, { ...attachment, taskId: task.id }])
  ));
  const contentTypes = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain' };

  for (const fileName of fileNames) {
    const extension = path.extname(fileName).toLowerCase();
    if (!contentTypes[extension]) continue;
    const id = path.basename(fileName, extension);
    if (await TaskAttachment.exists({ id })) continue;
    const data = await fs.readFile(path.join(uploadDirectory, fileName));
    const reference = attachmentReferences.get(id);
    await TaskAttachment.create({
      id,
      taskId: reference?.taskId || '',
      name: reference?.name || fileName,
      contentType: reference?.contentType || contentTypes[extension],
      size: data.length,
      uploadedBy: reference?.uploadedBy || '',
      uploadedByRole: reference?.uploadedByRole || '',
      data
    });
  }
}

async function startServer() {
  await connectDB();
  await initializeDashboardState();
  await migrateLegacyUploads();

  app.listen(PORT, () => {
    console.log(`TaskFlow backend running on http://localhost:${PORT}`);
    console.log('Storage mode: MongoDB');
  });
}

startServer().catch((error) => {
  console.error('Failed to start TaskFlow backend.', error);
  process.exit(1);
});
