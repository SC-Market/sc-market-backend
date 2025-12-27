FROM node:24-slim AS release

RUN apt update
RUN apt install -y git

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install dependencies using npm
RUN npm ci

COPY . .
RUN npm run build

# Create logs directory
RUN mkdir -p /app/logs

CMD ["node", "dist/src/server.js"]
EXPOSE 80:80
EXPOSE 443:443
