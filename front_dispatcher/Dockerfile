FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_WS_URL=ws://localhost:3010/ws
ARG VITE_AUTH_API_BASE_URL=http://localhost:3010
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_AUTH_API_BASE_URL=${VITE_AUTH_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
