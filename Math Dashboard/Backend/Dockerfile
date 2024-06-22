# Use an official node image as the base image
FROM node:16

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Rebuild bcrypt to ensure compatibility
RUN npm rebuild bcrypt --build-from-source


# Expose the port the app runs on
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
