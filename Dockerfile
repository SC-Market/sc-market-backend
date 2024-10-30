#FROM node:20-buster-slim AS deps
#
#RUN apt update
#RUN apt install -y git
#WORKDIR /app
#
#COPY package.json yarn.lock* ./
#RUN yarn global add typescript
#
#RUN yarn install --frozen-lockfile --production

FROM node:20-buster-slim AS release

RUN apt update
RUN apt install -y git

WORKDIR /app

#COPY --from=deps . .

COPY package.json yarn.lock* ./
RUN yarn global add typescript

RUN yarn install

COPY . .
RUN yarn build

CMD ["node", "src/server.js"]
EXPOSE 80:80
EXPOSE 443:443
