FROM node:25-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . ./
RUN npm run build

COPY docker-entrypoint.sh /usr/local/bin/memento-ui
RUN chmod 755 /usr/local/bin/memento-ui

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/memento-ui"]
