const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateProjectTasks = async (project) => {
  const prompt = `
You are an AI project management agent.

Analyze the following project and generate suitable tasks.

Project Title: ${project.title}

Project Description: ${project.description}

Project Start Date: ${project.startDate}

Project Deadline: ${project.deadline}

Generate 3 to 5 tasks.

For each task provide:
1. task_title
2. task_description
3. priority: Low, Medium, or High
4. suggested_deadline: an exact date in YYYY-MM-DD format

The suggested deadline must be between the project start date and project deadline.

Return ONLY a valid JSON array.

Example format:
[
  {
    "task_title": "Task name",
    "task_description": "Task description",
    "priority": "High",
    "suggested_deadline": "2026-09-20"
  }
]
`;

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: prompt,
  });

  return response.output_text;
};

const analyzeProjectProgress = async (project, tasks) => {
  const taskDetails = tasks.map((task) => ({
    title: task.title,
    priority: task.priority,
    status: task.status,
    deadline: task.deadline,
  }));

  const prompt = `
You are an AI project management agent.

Analyze the progress of this project.

Project Title: ${project.title}

Project Description: ${project.description}

Project Deadline: ${project.deadline}

Tasks:
${JSON.stringify(taskDetails, null, 2)}

Identify:
1. Overall project progress
2. Pending tasks
3. Tasks that may cause delays
4. Tasks with approaching or passed deadlines
5. Recommended actions

Return ONLY valid JSON in this format:

{
  "overall_status": "On Track, At Risk, or Delayed",
  "progress_summary": "short summary",
  "pending_tasks": [],
  "delay_risks": [],
  "recommendations": []
}
`;

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: prompt,
  });

  return response.output_text;
};

module.exports = {
  generateProjectTasks,
  analyzeProjectProgress,
};