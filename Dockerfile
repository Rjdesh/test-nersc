# syntax=docker/dockerfile:1

FROM node:24-alpine3.23 AS build
WORKDIR /app

ENV CYPRESS_INSTALL_BINARY=0
ENV HUSKY=0

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_BASE_URL=
ENV VITE_BASE_URL=${VITE_BASE_URL}

RUN npm run build:container

FROM node:24-alpine3.23 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
