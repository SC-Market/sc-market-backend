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

# The commit this image is built from (the deploy workflow passes it). The
# server reports it to Bugsnag as appVersion, matching the source maps the
# workflow uploads. Declared last so it doesn't bust the layers above.
ARG GIT_SHA
ENV APP_VERSION=${GIT_SHA}

ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 80:80
EXPOSE 443:443
