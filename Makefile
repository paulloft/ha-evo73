.PHONY: build run server-build server-start app-build app-watch
.DEFAULT_GOAL= help
include .env
include .env.local

server-build:
	npm i --force --silent

server-start:
	npm run start

server-watch:
	npm run watch

app-build:
	cd ./app && npm i --force --silent && npm run build:prod

app-watch:
	cd ./app && npm i && npm run watch

build: server-build app-build
run: build server-start
