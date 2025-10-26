FROM node:24-slim AS release

RUN apt update
RUN apt install -y git

WORKDIR /app

RUN yarn global add typescript
COPY package.json yarn.lock* ./

RUN yarn install

COPY . .
RUN yarn build

# Create logs directory
RUN mkdir -p /app/logs

CMD ["node", "dist/src/server.js"]
EXPOSE 80:80
EXPOSE 443:443
