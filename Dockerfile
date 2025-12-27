FROM node:24-slim AS release

RUN apt update
RUN apt install -y git

# Configure Git to rewrite SSH URLs to HTTPS for Docker builds
# This allows yarn.lock with SSH URLs to work without SSH keys
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:"

# Enable corepack for managing yarn version
RUN corepack enable

WORKDIR /app

# Copy package.json first so corepack can read packageManager field
COPY package.json yarn.lock* ./

# Corepack will automatically use the yarn version specified in packageManager
# Install dependencies using the version managed by corepack
RUN yarn install

# Install typescript globally using the corepack-managed yarn
RUN yarn global add typescript

COPY . .
RUN yarn build

# Create logs directory
RUN mkdir -p /app/logs

CMD ["node", "dist/src/server.js"]
EXPOSE 80:80
EXPOSE 443:443
