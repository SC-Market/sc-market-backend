/** Ukrainian email strings (see ../index.ts; keys and placeholders as in en.ts). */
const uk: Record<string, string> = {
  "layout.unsubscribe": "Відписатися",
  "layout.manage_preferences": "Керувати налаштуваннями",
  "layout.defaults_notice":
    "Ми ввімкнули листи про оновлення замовлень, пропозиції та непрочитані повідомлення. Вимкніть одним кліком:",
  "layout.turn_off": "Вимкнути ці листи",

  "common.greeting": "Вітаємо, {name}!",
  "common.status": "Статус:",
  "common.value": "Вартість:",
  "common.rating": "Оцінка:",
  "common.message": "Повідомлення:",
  "common.subdomain": "Субдомен:",
  "common.offer_number": "Пропозиція №{id}",
  "common.untitled": "Без назви",
  "common.view_order": "Переглянути замовлення",
  "common.view_offer": "Переглянути пропозицію",
  "common.view_listing": "Переглянути оголошення",
  "common.and_more": "…і ще {count}",
  "common.duration_days_one": "{count} день",
  "common.duration_days_few": "{count} дні",
  "common.duration_days_many": "{count} днів",
  "common.duration_days_other": "{count} дня",
  "common.duration_hours_one": "{count} годину",
  "common.duration_hours_few": "{count} години",
  "common.duration_hours_many": "{count} годин",
  "common.duration_hours_other": "{count} години",

  "status.order.not-started": "У черзі",
  "status.order.in-progress": "Виконується",
  "status.order.fulfilled": "Виконано",
  "status.order.cancelled": "Скасовано",
  "status.offer.active": "Активна",
  "status.offer.closed": "Закрита",

  "account_identity_changed.subject.username_released": "Ваше ім'я користувача SC Market змінено",
  "account_identity_changed.subject.discord_unlinked": "Discord від'єднано від вашого облікового запису SC Market",
  "account_identity_changed.subject.spectrum_cleared": "Зв'язок із RSI видалено з вашого облікового запису",
  "account_identity_changed.subject.spectrum_set": "Зв'язок із RSI у вашому обліковому записі оновлено",
  "account_identity_changed.subject.account_deactivated": "Ваш обліковий запис SC Market деактивовано",
  "account_identity_changed.subject.discord_link_skipped": "Ваш Discord не прив'язано до SC Market",
  "account_identity_changed.subject.account_reactivated": "Ваш обліковий запис SC Market знову активовано",
  "account_identity_changed.body.username_released":
    "Адміністратор звільнив ваше ім'я користувача. Тепер ваше ім'я користувача — {username}. Скористайтеся «Синхронізувати нікнейм» у налаштуваннях, щоб повернути свій поточний нікнейм RSI.",
  "account_identity_changed.body.discord_unlinked":
    "Адміністратор від'єднав Discord від вашого облікового запису. Ви можете знову прив'язати обліковий запис Discord у налаштуваннях.",
  "account_identity_changed.body.spectrum_cleared":
    "Адміністратор видалив зв'язок із RSI з вашого облікового запису. Підтвердьте свій обліковий запис RSI знову в налаштуваннях.",
  "account_identity_changed.body.spectrum_set": "Адміністратор оновив зв'язок із RSI у вашому обліковому записі.",
  "account_identity_changed.body.account_deactivated": "Адміністратор деактивував ваш обліковий запис.",
  "account_identity_changed.body.discord_link_skipped":
    "Ваш обліковий запис Discord уже прив'язано до іншого облікового запису SC Market, тому його не прив'язано до цього. Якщо обидва облікові записи ваші, зверніться до підтримки SC Market.",
  "account_identity_changed.body.account_reactivated": "Адміністратор знову активував ваш обліковий запис.",
  "account_identity_changed.security_note":
    "Це сповіщення безпеки щодо вашого облікового запису SC Market, тому його надсилають, навіть якщо ви вимкнули сповіщення електронною поштою. Якщо ви на нього не очікували, зверніться до підтримки SC Market.",
  "account_identity_changed.action": "Відкрити налаштування",

  "admin_alert.subject": "Сповіщення адміністратора",
  "admin_alert.preheader": "У вас нове сповіщення адміністратора: {title}",
  "admin_alert.heading": "Сповіщення адміністратора",
  "admin_alert.intro": "У вас нове сповіщення адміністратора:",
  "admin_alert.action": "Переглянути сповіщення",

  "buy_order_filled.subject": "Ваше замовлення на купівлю виконано",
  "buy_order_filled.body":
    "Продавець {seller} виконав ваше замовлення на купівлю: {quantity} × {item} за {total} aUEC. Для нього створено замовлення.",
  "buy_order_filled.open": "Потрібно ще {remaining}: ваше замовлення на купівлю залишається відкритим.",
  "buy_order_filled.complete": "Ваше замовлення на купівлю тепер виконано повністю.",
  "buy_order_filled.action": "Переглянути замовлення",

  "contract_offer_received.subject": "Нова пропозиція щодо вашого контракту",
  "contract_offer_received.preheader": "Хтось зробив пропозицію щодо вашого публічного контракту.",
  "contract_offer_received.heading": "Нова пропозиція щодо вашого контракту",
  "contract_offer_received.intro": "Хтось зробив пропозицію щодо вашого публічного контракту:",

  "contractor_invite.subject": "Запрошення до організації",
  "contractor_invite.preheader": "Вас запросили приєднатися до {org}.",
  "contractor_invite.heading": "Запрошення до організації",
  "contractor_invite.intro": "Вас запросили приєднатися до організації.",
  "contractor_invite.action": "Переглянути запрошення",

  "counter_offer_create.subject": "Отримано зустрічну пропозицію",
  "counter_offer_create.preheader": "Ви отримали зустрічну пропозицію.",
  "counter_offer_create.heading": "Отримано зустрічну пропозицію",
  "counter_offer_create.intro": "Створено зустрічну пропозицію:",

  "dm_reminder.subject.single": "У вас є непрочитане повідомлення на SC Market",
  "dm_reminder.subject.multiple_one": "У вас є непрочитані повідомлення в {count} розмові на SC Market",
  "dm_reminder.subject.multiple_few": "У вас є непрочитані повідомлення в {count} розмовах на SC Market",
  "dm_reminder.subject.multiple_many": "У вас є непрочитані повідомлення в {count} розмовах на SC Market",
  "dm_reminder.subject.multiple_other": "У вас є непрочитані повідомлення в {count} розмовах на SC Market",
  "dm_reminder.heading": "Непрочитані повідомлення",
  "dm_reminder.body.single": "У розмові на SC Market на вашу відповідь чекає повідомлення.",
  "dm_reminder.body.multiple_one": "У {count} розмові на SC Market на вашу відповідь чекають повідомлення.",
  "dm_reminder.body.multiple_few": "У {count} розмовах на SC Market на вашу відповідь чекають повідомлення.",
  "dm_reminder.body.multiple_many": "У {count} розмовах на SC Market на вашу відповідь чекають повідомлення.",
  "dm_reminder.body.multiple_other": "У {count} розмовах на SC Market на вашу відповідь чекають повідомлення.",
  "dm_reminder.nudge": "Не змушуйте торгових партнерів чекати: швидка відповідь допомагає угоді рухатися далі.",
  "dm_reminder.action": "Переглянути повідомлення",

  "market_item_bid.subject": "Нова ставка на ваше оголошення",
  "market_item_bid.preheader": "Хтось зробив ставку на «{title}».",
  "market_item_bid.heading": "Нова ставка на ваше оголошення",
  "market_item_bid.intro": "Хтось зробив ставку на ваше оголошення на ринку:",
  "market_item_bid.amount": "Сума ставки:",

  "market_item_offer.subject": "Нова пропозиція щодо вашого оголошення",
  "market_item_offer.preheader": "Хтось зробив пропозицію щодо «{title}».",
  "market_item_offer.heading": "Нова пропозиція щодо вашого оголошення",
  "market_item_offer.intro": "Хтось зробив пропозицію щодо вашого оголошення на ринку:",
  "market_item_offer.amount": "Сума пропозиції:",

  "offer_accepted.subject": "Пропозицію прийнято",
  "offer_accepted.preheader": "Вашу пропозицію прийнято.",
  "offer_accepted.heading": "Пропозицію прийнято",
  "offer_accepted.intro": "Вашу пропозицію прийнято:",

  "offer_create.subject": "Нова пропозиція",
  "offer_create.preheader": "Створено нову пропозицію.",
  "offer_create.heading": "Нова пропозиція",
  "offer_create.intro": "Створено нову пропозицію:",

  "offer_message.subject": "Нове повідомлення в пропозиції",
  "offer_message.preheader": "Нове повідомлення від {author} у вашій пропозиції.",
  "offer_message.heading": "Нове повідомлення в пропозиції",
  "offer_message.intro": "У вашій пропозиції нове повідомлення:",
  "offer_message.sent": "<b>{author}</b> пише:",

  "offer_pending_reminder.subject.single": "Пропозиція чекає на вашу відповідь",
  "offer_pending_reminder.subject.multiple_one": "{count} пропозиція чекає на вашу відповідь",
  "offer_pending_reminder.subject.multiple_few": "{count} пропозиції чекають на вашу відповідь",
  "offer_pending_reminder.subject.multiple_many": "{count} пропозицій чекають на вашу відповідь",
  "offer_pending_reminder.subject.multiple_other": "{count} пропозиції чекають на вашу відповідь",
  "offer_pending_reminder.body.single":
    "{buyer} чекає на відповідь щодо «{title}» уже {waited}. Прийміть, відхиліть, зробіть зустрічну пропозицію або відповідайте в чаті.",
  "offer_pending_reminder.body.multiple_one":
    "{count} покупець чекає на відповідь. Прийміть, відхиліть, зробіть зустрічну пропозицію або відповідайте в чаті.",
  "offer_pending_reminder.body.multiple_few":
    "{count} покупці чекають на відповідь. Прийміть, відхиліть, зробіть зустрічну пропозицію або відповідайте в чаті.",
  "offer_pending_reminder.body.multiple_many":
    "{count} покупців чекають на відповідь. Прийміть, відхиліть, зробіть зустрічну пропозицію або відповідайте в чаті.",
  "offer_pending_reminder.body.multiple_other":
    "{count} покупця чекають на відповідь. Прийміть, відхиліть, зробіть зустрічну пропозицію або відповідайте в чаті.",
  "offer_pending_reminder.action": "Відповісти на пропозицію",

  "offer_pending_final_reminder.subject.single": "Останнє нагадування: пропозиція досі чекає на вашу відповідь",
  "offer_pending_final_reminder.subject.multiple_one": "Останнє нагадування: {count} пропозиція досі чекає на вашу відповідь",
  "offer_pending_final_reminder.subject.multiple_few": "Останнє нагадування: {count} пропозиції досі чекають на вашу відповідь",
  "offer_pending_final_reminder.subject.multiple_many": "Останнє нагадування: {count} пропозицій досі чекають на вашу відповідь",
  "offer_pending_final_reminder.subject.multiple_other": "Останнє нагадування: {count} пропозиції досі чекають на вашу відповідь",
  "offer_pending_final_reminder.body.single":
    "{buyer} чекає на відповідь щодо «{title}» уже {waited}. Якщо відповіді не буде, покупцеві повідомлять, що пропозиція досі чекає.",
  "offer_pending_final_reminder.body.multiple_one":
    "{count} покупець чекає на відповідь. Якщо відповіді не буде, покупцям повідомлять, що їхні пропозиції досі чекають.",
  "offer_pending_final_reminder.body.multiple_few":
    "{count} покупці чекають на відповідь. Якщо відповіді не буде, покупцям повідомлять, що їхні пропозиції досі чекають.",
  "offer_pending_final_reminder.body.multiple_many":
    "{count} покупців чекають на відповідь. Якщо відповіді не буде, покупцям повідомлять, що їхні пропозиції досі чекають.",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} покупця чекають на відповідь. Якщо відповіді не буде, покупцям повідомлять, що їхні пропозиції досі чекають.",
  "offer_pending_final_reminder.action": "Відповісти на пропозицію",

  "offer_waiting_buyer.subject.single": "Ваша пропозиція досі чекає на продавця",
  "offer_waiting_buyer.subject.multiple_one": "{count} ваша пропозиція досі чекає на продавця",
  "offer_waiting_buyer.subject.multiple_few": "{count} ваші пропозиції досі чекають на продавця",
  "offer_waiting_buyer.subject.multiple_many": "{count} ваших пропозицій досі чекають на продавця",
  "offer_waiting_buyer.subject.multiple_other": "{count} вашої пропозиції досі чекають на продавця",
  "offer_waiting_buyer.body.single":
    "{seller} не відповідає на «{title}» уже {waited}. Зачекайте ще, напишіть продавцеві або відкличте пропозицію.",
  "offer_waiting_buyer.body.multiple":
    "Продавці не відповідають уже кілька днів. Зачекайте ще, напишіть їм або відкличте свої пропозиції.",
  "offer_waiting_buyer.action": "Написати продавцеві",
  "offer_waiting_buyer.withdraw_prompt": "Більше не потрібно? <link>Відкличте пропозицію</link>.",
  "offer_waiting_buyer.withdraw": "Відкликати пропозицію",
  "offer_waiting_buyer.keep_waiting": "Щоб чекати далі, нічого робити не потрібно.",

  "offer_rejected.subject": "Пропозицію відхилено",
  "offer_rejected.preheader": "Вашу пропозицію відхилено.",
  "offer_rejected.heading": "Пропозицію відхилено",
  "offer_rejected.intro": "Вашу пропозицію відхилено:",

  "order_assigned.subject": "Замовлення призначено",
  "order_assigned.preheader": "Вам призначено замовлення «{title}».",
  "order_assigned.heading": "Замовлення призначено вам",
  "order_assigned.intro": "Вам призначено нове замовлення:",
  "order_assigned.outro": "Перегляньте деталі замовлення та починайте, коли будете готові.",

  "order_create.subject": "Нове замовлення",
  "order_create.preheader": "Створено нове замовлення «{title}».",
  "order_create.heading": "Нове замовлення",
  "order_create.intro": "Створено нове замовлення:",

  "order_message.subject": "Нове повідомлення в замовленні",
  "order_message.preheader": "Нове повідомлення від {author} у замовленні «{title}».",
  "order_message.heading": "Нове повідомлення в замовленні",
  "order_message.intro": "Нове повідомлення від <b>{author}</b> у замовленні «{title}»:",
  "order_message.action": "Переглянути замовлення й відповісти",

  "order_review.subject": "Новий відгук про замовлення",
  "order_review.preheader": "{author}: новий відгук про ваше замовлення.",
  "order_review.heading": "Новий відгук",
  "order_review.intro": "Про ваше замовлення залишили новий відгук:",
  "order_review.by": "Автор:",

  "order_review_revision_requested.subject": "Запит на зміну відгуку",
  "order_review_revision_requested.preheader": "Вас просять змінити відгук про замовлення «{title}».",
  "order_review_revision_requested.heading": "Запит на зміну відгуку",
  "order_review_revision_requested.intro": "Вас просять змінити відгук про замовлення «{title}»:",
  "order_review_revision_requested.your_review": "Ваш відгук:",
  "order_review_revision_requested.request": "Запит на зміну:",

  "order_status_cancelled.subject": "Замовлення скасовано",
  "order_status_cancelled.heading": "Замовлення скасовано",
  "order_status_cancelled.intro": "Замовлення «{title}» скасовано.",
  "order_status_fulfilled.subject": "Замовлення виконано",
  "order_status_fulfilled.heading": "Замовлення виконано",
  "order_status_fulfilled.intro": "Замовлення «{title}» виконано.",
  "order_status_in_progress.subject": "Замовлення виконується",
  "order_status_in_progress.heading": "Замовлення виконується",
  "order_status_in_progress.intro": "Замовлення «{title}» тепер виконується.",
  "order_status_not_started.subject": "Статус замовлення оновлено",
  "order_status_not_started.heading": "Замовлення в черзі",
  "order_status_not_started.intro": "Статус замовлення «{title}» змінено на «У черзі».",

  "price_alert.subject": "Цінове сповіщення: {title} за {price} aUEC",
  "price_alert.preheader": "{title} виставлено за {price} aUEC — за вашою цільовою ціною {target} aUEC або нижче.",
  "price_alert.heading": "Цінове сповіщення",
  "price_alert.intro": "Оголошення з вашого списку відстеження досягло цільової ціни:",
  "price_alert.price": "Ціна:",
  "price_alert.target": "Ваша ціль:",
  "price_alert.quantity": "Кількість:",
  "price_alert.seller": "Продавець:",

  "staff_storefront_enquiry.subject": "Новий запит на вітрину: {name}",
  "staff_storefront_enquiry.preheader": "{requester} просить {subdomain}",
  "staff_storefront_enquiry.heading": "Новий запит на вітрину",
  "staff_storefront_enquiry.intro": "{requester} просить команду SC Market про брендовану вітрину.",
  "staff_storefront_enquiry.target_org": "Організація:",
  "staff_storefront_enquiry.target_shop": "Магазин:",
  "staff_storefront_enquiry.requested_by": "Запит від:",
  "staff_storefront_enquiry.contact": "Контакт:",
  "staff_storefront_enquiry.contact_discord": "Discord",
  "staff_storefront_enquiry.contact_message": "Повідомлення на SC Market",
  "staff_storefront_enquiry.action": "Відкрити в адмін-панелі",

  "storefront_enquiry_accepted.subject": "Запит на вітрину прийнято",
  "storefront_enquiry_accepted.preheader":
    "Команда SC Market прийняла ваш запит на брендовану вітрину для {name} ({subdomain}).",
  "storefront_enquiry_accepted.heading": "Запит на вітрину прийнято",
  "storefront_enquiry_accepted.intro": "Команда SC Market прийняла ваш запит на брендовану вітрину:",
  "storefront_enquiry_accepted.action": "Відкрити налаштування вітрини",
  "storefront_enquiry_declined.subject": "Запит на вітрину відхилено",
  "storefront_enquiry_declined.preheader":
    "Команда SC Market відхилила ваш запит на брендовану вітрину для {name} ({subdomain}).",
  "storefront_enquiry_declined.heading": "Запит на вітрину відхилено",
  "storefront_enquiry_declined.intro": "Команда SC Market відхилила ваш запит на брендовану вітрину:",
  "storefront_enquiry_declined.retry": "Ви можете надіслати новий запит у налаштуваннях вітрини.",
  "storefront_enquiry_declined.action": "Відкрити налаштування вітрини",

  "verification.subject": "Підтвердьте адресу електронної пошти — SC Market",
  "verification.preheader": "Підтвердьте цю адресу, щоб отримувати листи від SC Market.",
  "verification.heading": "Підтвердьте адресу електронної пошти",
  "verification.intro":
    "Дякуємо, що додали адресу електронної пошти до свого облікового запису SC Market. Підтвердьте її, натиснувши кнопку нижче:",
  "verification.intro_text":
    "Дякуємо, що додали адресу електронної пошти до свого облікового запису SC Market. Підтвердьте її за посиланням нижче:",
  "verification.action": "Підтвердити адресу",
  "verification.copy_link": "Або скопіюйте це посилання й вставте його в браузер:",
  "verification.expires": "Посилання для підтвердження діє 24 години.",
  "verification.ignore": "Якщо ви не надсилали цей запит, просто проігноруйте лист.",
}

export default uk
