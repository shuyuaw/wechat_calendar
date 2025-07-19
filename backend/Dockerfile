# Use an official Node.js runtime as a parent image.
# We choose version 18, which is a Long-Term Support (LTS) version.
FROM node:18-alpine

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the working directory.
# We copy these first to take advantage of Docker's layer caching.
# If these files don't change, Docker won't re-run 'npm install'.
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application's source code from your backend directory to /app in the container.
COPY . .

# Your app runs on port 3001, so we need to expose it.
# CloudBase Run will use this to route traffic to your container.
EXPOSE 3001

# Define the command to run your app.
# This is the same as running 'node server.js' in your terminal.
CMD [ "node", "server.js" ]
