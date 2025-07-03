# This is the final, production-ready Dockerfile for Puppeteer on Render.

# 1. Start from the official Puppeteer Docker image.
FROM ghcr.io/puppeteer/puppeteer:22.12.1

# 2. Set environment variables. This tells Puppeteer to use the browser 
#    that's already in the image, not to download a new one.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# 3. (CORRECTION) Switch to the non-root user's home directory. 
#    This user is created by the base image and has the correct permissions.
WORKDIR /home/pptruser

# 4. (CORRECTION) Copy package files with correct permissions for the pptruser.
COPY --chown=pptruser:pptruser package*.json ./

# 5. (CORRECTION) Install dependencies using 'npm ci' which is faster and safer for production builds.
RUN npm ci

# 6. (CORRECTION) Copy the rest of your application code with correct permissions.
COPY --chown=pptruser:pptruser . .

# 7. Tell Docker what command to run when the container starts.
CMD [ "npm", "start" ]