FROM node:22-slim AS release

RUN apt update
RUN apt install -y git

WORKDIR /app

RUN yarn global add typescript
COPY package.json yarn.lock* ./

RUN yarn install

COPY . .
RUN yarn build

CMD ["node", "dist/server.js"]
EXPOSE 80:80
EXPOSE 443:443
