FROM node:18

WORKDIR /app

COPY package*.json ./
RUN mkdir -p /app/uploads

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]

