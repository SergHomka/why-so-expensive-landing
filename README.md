# Why.So.Expensive — почему мой AI столько стоит

[English version below](#english)

Счёт за Claude Code пришёл, а за что платили — непонятно. Этот проект объясняет не «сколько вы потратили», а **почему столько и что сделать**: читает локальные логи AI-инструмента и называет конкретную причину, сумму и действие.

- **Лендинг:** https://serghomka.github.io/why-so-expensive-landing/
- **Демо — разбор вашего лога:** https://serghomka.github.io/why-so-expensive-landing/demo.html

Проект в разработке. Сейчас работает демо для Claude Code; Codex, OpenRouter и Cursor — следующие.

## Как попробовать

1. Откройте [демо](https://serghomka.github.io/why-so-expensive-landing/demo.html).
2. Перетащите на страницу файл сессии Claude Code (`.jsonl`). Можно несколько сразу.
   - Windows: `%USERPROFILE%\.claude\projects\`
   - macOS и Linux: `~/.claude/projects/`
3. Нет файла под рукой — нажмите «Нет файла — показать на примере».

**Файл не покидает браузер.** Разбор идёт прямо во вкладке, страница не отправляет ни одного сетевого запроса. Можно отключить интернет и убедиться.

## Что получаете

- **Коротко** — во что обошлась сессия и главная причина одной фразой.
- **Что мы проверили** — все десять проверок со статусом: проблема, обратите внимание, всё хорошо.
- **Во что обошлись ваши просьбы** — самые дорогие ваши сообщения с ценой каждого.
- **Что нашли и что с этим делать** — по каждой находке: что произошло, почему это стоит денег, что сделать и сколько можно сэкономить. Написано простым языком, без терминов.

## Десять проверок

| № | Группа | Проверка | Что ищет | Статус |
|---|---|---|---|---|
| 1 | Что модель перечитывает | Длина переписки | Переписка разрослась, и каждое сообщение стоит всё дороже | работает |
| 2 | Что модель перечитывает | Повторно открытые файлы | Модель открывает один и тот же файл снова и снова | работает |
| 3 | Что модель перечитывает | Картинки в переписке | Скриншоты, которые перечитываются с каждым сообщением | работает |
| 4 | Что модель перечитывает | Скидка на перечитывание | Сработала ли скидка на повторное чтение (кэш) | работает |
| 5 | Как поставлена задача | Самая дорогая просьба | Одна просьба съела большую часть счёта | работает |
| 6 | Как поставлена задача | Ошибки и повторные попытки | Круги «ошиблась — попробовала снова» | в следующем обновлении |
| 7 | Как поставлена задача | Работа без результата | Деньги потрачены, а ни один файл не изменился | в следующем обновлении |
| 8 | Модель и настройки | Размышления модели | Доля оплаченного текста, которую вы не видите | работает |
| 9 | Модель и настройки | Дорогая модель для мелочей | Дорогая модель отвечает в пару строк | работает |
| 10 | Модель и настройки | Забытые фоновые процессы | Помощники тратят деньги после конца задачи | в следующем обновлении |

## Как считаем

- Цены — публичный прайс Anthropic за 1 млн токенов, с учётом записи в кэш (×1,25 на 5 минут, ×2 на час) и чтения из кэша (×0,1).
- Claude Code записывает один и тот же ответ модели в лог по нескольку раз. Мы считаем каждый ответ один раз, по `message.id`. На настоящих логах без этого сумма выходила в 2,1–2,7 раза больше правды.
- Оценка экономии — верхняя граница: например, «если бы переписка очищалась перед каждой новой просьбой». Страница прямо пишет, какое допущение взято.

## Что в репозитории

| Файл | Что это |
|---|---|
| `index.html` | Лендинг на русском |
| `demo.html` | Демо на русском |
| `en/index.html`, `en/demo.html` | То же на английском |

Каждая страница — один HTML-файл: стили и скрипт внутри, без библиотек, без сборки, без сервера. Сайт публикуется через GitHub Pages из ветки `main`.

## Дальше

1. Claude Code — CLI, скилл и MCP-сервер с той же диагностикой по всем сессиям сразу
2. Codex
3. OpenRouter
4. Cursor

## Связаться

Узнали свой счёт, хотите попробовать раньше других или есть идея для проверки — пишите: Telegram [@doyrden](https://t.me/doyrden).

---

<a id="english"></a>

# Why.So.Expensive — why is my AI so expensive

Your Claude Code bill came in and you have no idea what you paid for. This project tells you not "how much you spent" but **why it cost that much and what to do about it**: it reads your AI tool's local logs and names the specific cause, the amount, and a fix.

- **Landing page:** https://serghomka.github.io/why-so-expensive-landing/en/
- **Demo — analyze your own log:** https://serghomka.github.io/why-so-expensive-landing/en/demo.html

Work in progress. The Claude Code demo works today; Codex, OpenRouter, and Cursor come next.

## Try it

1. Open the [demo](https://serghomka.github.io/why-so-expensive-landing/en/demo.html).
2. Drop a Claude Code session file (`.jsonl`) onto the page. Several at once is fine.
   - Windows: `%USERPROFILE%\.claude\projects\`
   - macOS and Linux: `~/.claude/projects/`
3. No file handy? Click "No file? Show me an example".

**Your file never leaves the browser.** The analysis runs right in the tab, and the page makes no network requests. Turn off your internet and see for yourself.

## What you get

- **In short** — what the session cost and the main cause in one sentence.
- **What we checked** — all ten checks with a status: problem, worth a look, all good.
- **What your requests cost** — your most expensive messages with the price of each.
- **What we found and what to do** — for each finding: what happened, why it costs money, what to do, and how much you could save. Plain language, no jargon.

## Ten checks

| # | Group | Check | What it looks for | Status |
|---|---|---|---|---|
| 1 | What the model rereads | Conversation length | The conversation grew, so every message costs more | live |
| 2 | What the model rereads | Files reopened | The model opens the same file again and again | live |
| 3 | What the model rereads | Images in the conversation | Screenshots reread with every message | live |
| 4 | What the model rereads | Rereading discount | Whether the discount on rereading (cache) kicked in | live |
| 5 | How the task was set | Most expensive request | One request ate most of the bill | live |
| 6 | How the task was set | Errors and retries | "Failed, tried again" loops | next update |
| 7 | How the task was set | Work with no result | Money spent, yet no file changed | next update |
| 8 | Model and settings | Model's thinking | The share of paid text you never see | live |
| 9 | Model and settings | Expensive model for small stuff | An expensive model giving two-line replies | live |
| 10 | Model and settings | Forgotten background processes | Helpers still spending after the task is done | next update |

## How we count

- Prices come from Anthropic's public per-1M-token price list, including cache writes (×1.25 for 5 minutes, ×2 for an hour) and cache reads (×0.1).
- Claude Code writes the same model response to the log several times. We count each response once, by `message.id`. On real logs, skipping this inflated the total 2.1–2.7×.
- Savings estimates are an upper bound, e.g. "if the conversation had been cleared before each new request". The page states the assumption it uses.

## What's in the repo

| File | What it is |
|---|---|
| `index.html` | Landing page (Russian) |
| `demo.html` | Demo (Russian) |
| `en/index.html`, `en/demo.html` | The same in English |

Every page is a single HTML file with inline styles and script: no libraries, no build step, no server. The site is published with GitHub Pages from the `main` branch.

## Roadmap

1. Claude Code — a CLI, a skill, and an MCP server with the same diagnosis across all sessions at once
2. Codex
3. OpenRouter
4. Cursor

## Contact

Recognized your own bill, want early access, or have an idea for a check? Message me on Telegram: [@doyrden](https://t.me/doyrden).
