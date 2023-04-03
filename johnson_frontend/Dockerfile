# syntax=docker/dockerfile:1
FROM node:18-bullseye
WORKDIR /home

COPY ./ .
RUN npm config set ignore-scripts true
RUN npm ci
RUN npm run build

# /home/dist
FROM nginx:1.19-alpine
COPY --from=0 /home/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template