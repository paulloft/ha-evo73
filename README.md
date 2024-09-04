# Интеграция домофона EVO73 в Home Assistant

Работа дополнения возможна только с домофонами компании [EVO](https://www.evo73.ru/)

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fpaulloft%2Fha-evo73)

## Возможности интеграции
- Открытие двери
- Отправка вебхука при звонке в домофон с нагрузочными данными
- Получение ссылки на стрим с камеры
- Получение изображения с камеры

## Чек-лист для правильной работы интеграции
- Домофон с камерой от компании EVO
- Наличие зарегистрированного аккаунта с возможностью входа в мобильное приложение
- Оплаченный тариф

## Первичная авторизация
Для создания токенов доступа необходимо авторизоваться отправив GET запрос на адрес `http://localhost:8181/sendsms`

На указанный в настройках номер телефона должно придти СМС с кодом авторизации, который нужно отправить GET запросом по адресу `http://localhost:8181/auth?code=<your_code>`

## Настройка интеграции в Home Assistant

Для отправки уведомления необходимо создать новую автоматизацию.

[![Open your Home Assistant instance and show your automations.](https://my.home-assistant.io/badges/automations.svg)](https://my.home-assistant.io/redirect/automations/)

В качестве тригера использовать получение полезных данных Webhook

В качестве действия использовать отправку уведомления

Пример отправки уведомления в текстовом формате

```
action: notify.notify
metadata: {}
data:
  title: Кто-то звонит в домофон
  message: 🏠 {{ trigger.json.address }}
  data:
    image: "{{ trigger.json.snapshot }}"
    actions:
      - action: rest_command.open_door
        title: Открыть дверь
```

Полезная нагрузка данных в webhook:
- address: Адрес звонящего домофона
- apartment: Квартира звонящего домофона
- entrance: Номер входа, откуда происходит звонок
- openDoorUrl: Ссылка на открытие двери (Должна быть открыта методом POST)
- snapshot: Ссылка на снапшот с камеры

## Roadmap
- Автоматический проброс событий и сущностей через MQTT
