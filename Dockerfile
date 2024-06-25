FROM node:latest
WORKDIR /app
copy package.json ./
run npm install
copy . .
cmd ["npm","start"]