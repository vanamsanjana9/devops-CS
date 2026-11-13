# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose port (adjust if your app uses a different port, e.g., 5000)
EXPOSE 5000

# Start the application
CMD ["npm", "start"]