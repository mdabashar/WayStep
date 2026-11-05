FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY mcp/server.mjs mcp/server.mjs
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "mcp/server.mjs"]
