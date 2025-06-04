# SC Market Backend

This repository hosts the backend for [SC Market](https://sc-market.space).

## Local Development

Please use the [.env.template](.env.template) file to create a local `.env` file.

### Database

The database can be spun up using docker-compose using the default credentials in the env template.
Using docker-compose will require also cloning [SCMarketBot](https://github.com/SC-Market/SCMarketBot) in an adjacent directory.

```shell
docker-compose up -d postgres
```

### Backend Server

This project uses yarn to manage dependencies. You can install dependencies using the `yarn` command.

```shell
yarn install
```

Running the project is simple and can be done with

```shell
yarn dev
```

You can ensure your changes build with

```shell
yarn build
```
