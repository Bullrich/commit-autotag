FROM node:17-alpine as Builder

WORKDIR /action

COPY package.json package-lock.json tsconfig.json ./

RUN npm ci

ADD src ./src

RUN npm run build

FROM node:17-slim

COPY --from=Builder /action/dist /action/dist

CMD ["node", "/action/dist/main.js"]
