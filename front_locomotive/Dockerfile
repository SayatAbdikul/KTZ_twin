FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_WS_URL=ws://localhost:3001/ws
ARG VITE_API_BASE_URL=http://localhost:3001
ARG VITE_REPLAY_API_BASE_URL=http://localhost:3010
ARG VITE_ENABLE_MOCKS=false

ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_REPLAY_API_BASE_URL=${VITE_REPLAY_API_BASE_URL}
ENV VITE_ENABLE_MOCKS=${VITE_ENABLE_MOCKS}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
