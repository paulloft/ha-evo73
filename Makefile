.DEFAULT_GOAL = help
.PHONY: help build run server-build server-start app-build app-watch

## —— EVO APP Makefile —————————————————————————————————————————————————————————————
help: ## Список всех доступных команд
	@grep -E '(^[a-zA-Z0-9\./_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-30s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

build: server-build app-build ## Запустить сборку всего приложения

run: build server-start ## Запуск полнофункционального приложения со сборкой

## —— Backend server ———————————————————————————————————————————————————————————————
server-build: ## Собрать зависимости backend сервера
	npm i --force --silent

server-start: ## Запуск backend сервера
	npm run start

server-watch: ## Запуск отладки backend сервера
	npm run watch

## —— Frontend app —————————————————————————————————————————————————————————————————
app-build: ## Собрать пакет frontend приложения
	cd ./app && npm i --force --silent && npm run build:prod

app-watch: ## Запуск отладки frontend приложения
	cd ./app && npm i && npm run watch
