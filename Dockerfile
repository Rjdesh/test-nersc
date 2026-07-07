# syntax=docker/dockerfile:1

FROM node:24-alpine3.23 AS deps
WORKDIR /app

ENV CYPRESS_INSTALL_BINARY=0
ENV HUSKY=0

COPY package*.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY . .
ARG VITE_BASE_URL=
ENV VITE_BASE_URL=${VITE_BASE_URL}
RUN npm run build

FROM node:24-alpine3.23 AS app
WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=5175
ENV VITE_BASE_URL=

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tsr.config.json ./
COPY src ./src
COPY public ./public
COPY images ./images
COPY --from=build /app/dist ./dist

EXPOSE 5175

CMD ["npm", "run", "start", "--", "--host", "0.0.0.0"]
