FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json .
COPY tsconfig.json .
COPY vite.config.ts .
COPY tailwind.config.js .
COPY postcss.config.js .
COPY index.html .
COPY src ./src
RUN npm install
EXPOSE 5173
CMD ["npm","run","dev","--","--host","0.0.0.0"]
