# hydrogen-alpine, hydrogen-alpine3.17, lts-alpine, lts-alpine3.17
FROM node:18-bullseye
WORKDIR /home

COPY ./ .
RUN npm ci --only=production
CMD [ "node", "index.mjs" ]
