# This Dockerfile will package the application for production deployment on Render.

# 1. Start from the official Puppeteer Docker image. 
# This image already contains Node.js and a compatible version of Chromium.
FROM ghcr.io/puppeteer/puppeteer:22.12.1

# 2. Tell Puppeteer to use the version of Chromium that's already in this image
# and not to try downloading another one.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# 3. Set the working directory inside the container.
WORKDIR /usr/src/app

# 4. Copy the package.json and package-lock.json first.
# This is a Docker optimization to speed up future builds.
COPY package*.json ./

# 5. Install the project's dependencies (axios and puppeteer library).
RUN npm install

# 6. Copy the rest of your application code (scraper.js, index.html) into the container.
COPY . .

# 7. Tell Docker what command to run when the container starts.
# This will execute `npm start` from your package.json.
CMD [ "npm", "start" ]