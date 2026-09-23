# Why.So.Expensive — почему мой AI столько стоит

[English version below](#english)

Счёт за Claude Code пришёл, а за что платили — непонятно. Или вы на подписке, а лимит кончается к обеду. Этот проект объясняет не «сколько вы потратили», а **почему столько и что сделать**: читает локальные логи Claude Code и называет конкретную причину, сумму и действие.

- **Лендинг:** https://serghomka.github.io/why-so-expensive-landing/
- **Демо — разбор в браузере:** https://serghomka.github.io/why-so-expensive-landing/demo.html
- **В терминале, по всем сессиям сразу:** `npx github:SergHomka/why-so-expensive-landing`

Проект в разработке. Сейчас работает Claude Code; Codex, OpenRouter и Cursor — следующие.

## Два способа попробовать

### В браузере

1. Откройте [демо](https://serghomka.github.io/why-so-expensive-landing/demo.html).
2. Перетащите на страницу файл сессии Claude Code (`.jsonl`), несколько файлов или всю папку `projects`.
   - Windows: `%USERPROFILE%\.claude\projects\`
   - macOS и Linux: `~/.claude/projects/` (папка скрытая: в окне выбора нажмите `Cmd+Shift+G` и вставьте путь)
3. Нет файла под рукой — нажмите «Нет файла — показать на примере».

**Файл не покидает браузер.** Разбор идёт прямо во вкладке, страница не отправляет ваши данные никуда. Можно отключить интернет и убедиться.

### В терминале

Нужен Node.js 16 или новее. Устанавливать ничего не нужно:

```bash
npx github:SergHomka/why-so-expensive-landing
```

Без настроек команда берёт все сессии из `~/.claude/projects` за последние 7 дней и показывает:

- сколько они стоили;
- какие проверки срабатывают из сессии в сессию и сколько на этом можно сэкономить;
- расходы по проектам;
- три самые дорогие сессии с главной причиной и путём к файлу.

| Настройка | Что делает |
|---|---|
| `--days N` | Сессии за последние N дней (по умолчанию 7) |
| `--all` | Все сессии без ограничения по дням |
| `--top N` | Сколько самых дорогих сессий показать (по умолчанию 3) |
| `--lang ru` / `--lang en` | Язык отчёта (по умолчанию — язык системы) |
| `--json` | Результат в JSON: для скриптов и других программ |
| `папка или файлы` | Разобрать не `~/.claude/projects`, а указанное |

Консольная версия тоже ничего не отправляет в сеть: только читает файлы и печатает результат.

## Что получаете

- **Коротко** — во что обошлась сессия и главная причина одной фразой. Кнопка «Скопировать итог» копирует сумму и названия проверок, без текстов ваших просьб и имён файлов.
- **Что повторяется из сессии в сессию** — если загрузили несколько сессий: какие проверки срабатывают чаще всего и сколько можно сэкономить по всем вместе.
- **Что мы проверили** — все десять проверок со статусом: проблема, обратите внимание, всё хорошо.
- **Во что обошлись ваши просьбы** — самые дорогие ваши сообщения с ценой каждого.
- **Разбор по каждой проверке** — карточка на каждый из десяти пунктов. Если есть проблема: что произошло, почему это стоит денег, что сделать и сколько можно сэкономить. Если всё хорошо: что увидели и как не допустить проблем в будущем.

## Десять проверок

| № | Группа | Проверка | Что ищет |
|---|---|---|---|
| 1 | Что модель перечитывает | Длина переписки | Переписка разрослась, и каждое сообщение стоит всё дороже |
| 2 | Что модель перечитывает | Повторно открытые файлы | Модель открывает один и тот же файл снова и снова |
| 3 | Что модель перечитывает | Картинки в переписке | Скриншоты, которые перечитываются с каждым сообщением |
| 4 | Что модель перечитывает | Скидка на перечитывание | Сработала ли скидка на повторное чтение (кэш) |
| 5 | Как поставлена задача | Самая дорогая просьба | Одна просьба съела большую часть счёта |
| 6 | Как поставлена задача | Ошибки и повторные попытки | Круги «ошиблась — попробовала снова» |
| 7 | Как поставлена задача | Работа без результата | Деньги потрачены, а ни один файл не изменился |
| 8 | Модель и настройки | Размышления модели | Доля оплаченного текста, которую вы не видите |
| 9 | Модель и настройки | Дорогая модель для мелочей | Дорогая модель отвечает в пару строк |
| 10 | Модель и настройки | Забытые фоновые процессы | Фоновые задачи будят модель, когда вы уже ушли |

## Как считаем

- Цены — публичный прайс Anthropic за 1 млн токенов, с учётом записи в кэш (×1,25 на 5 минут, ×2 на час) и чтения из кэша (×0,1).
- **Подписка Pro или Max.** Суммы в отчёте — цены API. Сверху их никто не спишет, но та же работа расходует ваш лимит, и те же привычки сжигают его быстрее. Советы работают одинаково.
- Claude Code записывает один и тот же ответ модели в лог по нескольку раз. Мы считаем каждый ответ один раз, по `message.id`. На настоящих логах без этого сумма выходила в 2,1–2,7 раза больше правды. По нескольким файлам дубли тоже убираются: ответ, который лежит в двух файлах, считается один раз.
- Оценка экономии — верхняя граница: например, «если бы переписка очищалась перед каждой новой просьбой». Отчёт прямо пишет, какое допущение взято.
- Пороги проверок пока подобраны на небольшом числе сессий. Если какая-то проверка сработала зря — [напишите](https://github.com/SergHomka/why-so-expensive-landing/issues/new), это очень поможет.

## Что в репозитории

| Файл | Что это |
|---|---|
| `engine.js` | Движок: разбор лога, цены, десять проверок, сводка по сессиям. Без текстов, общий для браузера и терминала |
| `i18n/ru.js`, `i18n/en.js` | Все тексты: карточки проверок, подписи отчёта, консольная версия |
| `app.js`, `demo.css` | Страница демо: отрисовка отчёта и стили, общие для обоих языков |
| `demo.html`, `en/demo.html` | Демо на русском и английском |
| `index.html`, `en/index.html` | Лендинг на русском и английском |
| `cli.js`, `package.json` | Консольная версия (`npx`) |
| `tests/check.js` | Проверки движка, переводов и консольной версии |

Без библиотек, без сборки, без сервера. Сайт публикуется через GitHub Pages из ветки `main`.

Проверки запускаются так:

```bash
node tests/check.js           # учебный пример, крайние случаи, консольная версия
node tests/check.js --local   # плюс все ваши логи из ~/.claude/projects (никуда не копируются)
```

## Дальше

1. Claude Code — скилл, чтобы спрашивать прямо в Claude Code, и MCP-сервер
2. Codex
3. OpenRouter
4. Cursor

## Связаться

Узнали свой счёт, хотите попробовать раньше других или есть идея для проверки — пишите: Telegram [@doyrden](https://t.me/doyrden) или [issue на GitHub](https://github.com/SergHomka/why-so-expensive-landing/issues/new).

---

<a id="english"></a>

# Why.So.Expensive — why is my AI so expensive

Your Claude Code bill came in and you have no idea what you paid for. Or you're on a subscription and the usage limit runs out by lunchtime. This project tells you not "how much you spent" but **why it cost that much and what to do about it**: it reads Claude Code's local logs and names the specific cause, the amount, and a fix.

- **Landing page:** https://serghomka.github.io/why-so-expensive-landing/en/
- **Demo — analysis in your browser:** https://serghomka.github.io/why-so-expensive-landing/en/demo.html
- **In the terminal, all sessions at once:** `npx github:SergHomka/why-so-expensive-landing`

Work in progress. Claude Code works today; Codex, OpenRouter, and Cursor come next.

## Two ways to try it

### In the browser

1. Open the [demo](https://serghomka.github.io/why-so-expensive-landing/en/demo.html).
2. Drop a Claude Code session file (`.jsonl`), several files, or the whole `projects` folder onto the page.
   - Windows: `%USERPROFILE%\.claude\projects\`
   - macOS and Linux: `~/.claude/projects/` (the folder is hidden: in the file dialog press `Cmd+Shift+G` and paste the path)
3. No file at hand? Click "No file? Show me an example".

**Your file never leaves the browser.** The analysis runs right in the tab, and the page doesn't send your data anywhere. You can turn off the internet and check.

### In the terminal

You need Node.js 16 or newer. Nothing to install:

```bash
npx github:SergHomka/why-so-expensive-landing
```

With no options, the command takes every session from `~/.claude/projects` from the last 7 days and shows:

- what they cost;
- which checks fire from session to session, and how much you could save;
- spending by project;
- the three most expensive sessions, with the main cause and the file path.

| Option | What it does |
|---|---|
| `--days N` | Sessions from the last N days (default 7) |
| `--all` | All sessions, no day limit |
| `--top N` | How many of the most expensive sessions to show (default 3) |
| `--lang en` / `--lang ru` | Report language (default: your system language) |
| `--json` | JSON output, for scripts and other programs |
| `folder or files` | Analyze these instead of `~/.claude/projects` |

The command-line version doesn't send anything over the network either: it only reads files and prints the result.

## What you get

- **In short** — what the session cost and the main cause in one sentence. The "Copy summary" button copies the total and the check names, without the text of your requests or any file names.
- **What repeats from session to session** — when you load several sessions: which checks fire most often and how much you could save across all of them.
- **What we checked** — all ten checks with a status: problem, worth a look, all good.
- **What your requests cost** — your most expensive messages, with the price of each.
- **Each check in detail** — a card for each of the ten points. If there's a problem: what happened, why it costs money, what to do, and how much you could save. If all is good: what we saw and how to keep it that way.

## The ten checks

| # | Group | Check | What it looks for |
|---|---|---|---|
| 1 | What the model rereads | Conversation length | The conversation grew, so every message costs more |
| 2 | What the model rereads | Files reopened | The model opens the same file again and again |
| 3 | What the model rereads | Images in the conversation | Screenshots reread with every message |
| 4 | What the model rereads | Rereading discount | Whether the discount on rereading (cache) kicked in |
| 5 | How the task was set | Most expensive request | One request ate most of the bill |
| 6 | How the task was set | Errors and retries | "Failed, tried again" loops |
| 7 | How the task was set | Work with no result | Money spent, yet no file changed |
| 8 | Model and settings | Model's thinking | The share of paid text you never see |
| 9 | Model and settings | Expensive model for small stuff | An expensive model giving two-line replies |
| 10 | Model and settings | Forgotten background processes | Background tasks wake the model after you have left |

## How we count

- Prices come from Anthropic's public per-1M-token price list, including cache writes (×1.25 for 5 minutes, ×2 for an hour) and cache reads (×0.1).
- **Pro or Max subscription.** The amounts in the report are API prices. Nobody charges them on top, but the same work draws down your usage limit, and the same habits burn through it faster. The advice works the same way.
- Claude Code writes the same model response to the log several times. We count each response once, by `message.id`. On real logs, skipping this inflated the total 2.1–2.7×. Across several files, duplicates are removed too: a response stored in two files is counted once.
- Savings estimates are an upper bound, e.g. "if the conversation had been cleared before each new request". The report states the assumption it uses.
- The check thresholds were tuned on a small number of sessions so far. If a check fired when it shouldn't have, please [open an issue](https://github.com/SergHomka/why-so-expensive-landing/issues/new) — it helps a lot.

## What's in the repo

| File | What it is |
|---|---|
| `engine.js` | The engine: log parsing, prices, the ten checks, the multi-session summary. No text, shared by the browser and the terminal |
| `i18n/ru.js`, `i18n/en.js` | All text: check cards, report labels, the command-line version |
| `app.js`, `demo.css` | The demo page: report rendering and styles, shared by both languages |
| `demo.html`, `en/demo.html` | Demo in Russian and English |
| `index.html`, `en/index.html` | Landing page in Russian and English |
| `cli.js`, `package.json` | The command-line version (`npx`) |
| `tests/check.js` | Tests for the engine, the translations, and the command-line version |

No libraries, no build step, no server. The site is published with GitHub Pages from the `main` branch.

To run the tests:

```bash
node tests/check.js           # sample, edge cases, command-line version
node tests/check.js --local   # plus all your logs from ~/.claude/projects (nothing is copied)
```

## Roadmap

1. Claude Code — a skill, so you can ask right inside Claude Code, and an MCP server
2. Codex
3. OpenRouter
4. Cursor

## Contact

Recognized your own bill, want early access, or have an idea for a check? [Open an issue](https://github.com/SergHomka/why-so-expensive-landing/issues/new) or message me on Telegram: [@doyrden](https://t.me/doyrden).
