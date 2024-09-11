.PHONY: run build watch
.DEFAULT_GOAL= help
include .env
include .env.local

build:
	npm i && cd ./app && npm i --force --silent && npm run build:prod

watch:
	cd ./app && npm i && npm run watch

start:
	node ./src/index.js

run: build start
