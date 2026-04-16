FROM node:24-slim AS release

RUN apt update
RUN apt install -y git

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install dependencies using npm (include devDependencies so `tsx` is available
# for `npm run migrate:latest` at container start).
RUN npm ci

COPY . .
RUN chmod +x /app/docker-entrypoint.sh
RUN npm run build

# Create logs directory
RUN mkdir -p /app/logs

ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 80:80
EXPOSE 443:443
