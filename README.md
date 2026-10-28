# Интеграция домофона EVO73 в Home Assistant
Работа дополнения возможна только с домофонами компании [EVO](https://www.evo73.ru/)

## Возможности интеграции
- Открытие двери
- Отправка вебхука при звонке в домофон с нагрузочными данными
- Получение ссылки на стрим с камеры
- Получение изображения с камеры

## Чек-лист для правильной работы интеграции
- Домофон с камерой от компании EVO
- Наличие зарегистрированного аккаунта с возможностью входа в мобильное приложение
- Оплаченный тариф

## Установка дополнения
Добавьте репозиторий дополнения в ваш Home Assistant

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fpaulloft%2Fha-addons-repo)

Сверху справа нажмите три точки и выберите пункт «Проверить наличие обновлений» и перезагрузите страницу. После этого в списке появится репозиторий с дополнением.

## Первичная авторизация
Для создания токенов доступа откройте Web-интерфейс дополнения и нажмите «Запросить звонок». Введите последние 4 цифры входящего номера и нажмите «Авторизоваться».

Можно выбрать «Запросить СМС» и ввести код из сообщения. Используйте код от последнего запроса: способ подтверждения должен совпадать со способом получения кода.

На указанный в настройках номер телефона должно прийти СМС с кодом, который необходимо ввести в соответсвующее поле и нажать кнопку «Авторизоваться»

## Настройка интеграции в Home Assistant
### Служба для открытия двери
Для создания службы необходимо в `configuration.yaml` добавить строки

```yaml
rest_command:
  doorphone_open:
    url: 'http://961868a2-doorphone/open'
    method: GET
```

### Создание автоматизации с отправкой уведомления
Создайте новую автоматизацию

[![Open your Home Assistant instance and show your automations.](https://my.home-assistant.io/badges/automations.svg)](https://my.home-assistant.io/redirect/automations/)

В качестве тригера использовать получение полезных данных Webhook

В качестве действия использовать отправку уведомления

Пример отправки уведомления в текстовом формате

```yaml
action: notify.notify
metadata: {}
data:
  title: Кто-то звонит в домофон
  message: 🏠 {{ trigger.json.address }}
  data:
    image: "{{ trigger.json.snapshot }}"
    actions:
      - action: rest_command.doorphone_open
        title: Открыть дверь
```

Полезная нагрузка данных в webhook:
- address: Адрес звонящего домофона
- apartment: Квартира звонящего домофона
- entrance: Номер входа, откуда происходит звонок
- openDoorUrl: Ссылка на открытие двери (Должна быть открыта методом POST)
- snapshot: Ссылка на снапшот с камеры

## Roadmap
- Автоматическое создание событий служб и сущностей
