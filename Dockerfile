FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY data ./data
COPY LICENSE THIRD_PARTY_NOTICES.md ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
CMD ["node", "src/http.js"]
