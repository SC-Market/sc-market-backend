/** German email strings (see ../index.ts; keys and placeholders as in en.ts). */
const de: Record<string, string> = {
  "layout.unsubscribe": "Abmelden",
  "layout.manage_preferences": "Einstellungen verwalten",
  "layout.defaults_notice":
    "Wir haben E-Mails zu Bestellungen, Angeboten und ungelesenen Nachrichten für dich eingeschaltet. Mit einem Klick ausschalten:",
  "layout.turn_off": "Diese E-Mails ausschalten",

  "common.greeting": "Hallo {name},",
  "common.status": "Status:",
  "common.value": "Wert:",
  "common.rating": "Bewertung:",
  "common.message": "Nachricht:",
  "common.subdomain": "Subdomain:",
  "common.offer_number": "Angebot #{id}",
  "common.untitled": "Ohne Titel",
  "common.view_order": "Bestellung ansehen",
  "common.view_offer": "Angebot ansehen",
  "common.view_listing": "Inserat ansehen",
  "common.and_more": "…und {count} weitere",
  "common.duration_days_one": "{count} Tag",
  "common.duration_days_other": "{count} Tage",
  "common.duration_hours_one": "{count} Stunde",
  "common.duration_hours_other": "{count} Stunden",

  "status.order.not-started": "In Warteschlange",
  "status.order.in-progress": "In Bearbeitung",
  "status.order.fulfilled": "Erfüllt",
  "status.order.cancelled": "Storniert",
  "status.offer.active": "Aktiv",
  "status.offer.closed": "Geschlossen",

  "account_identity_changed.subject.username_released": "Dein SC-Market-Benutzername wurde geändert",
  "account_identity_changed.subject.discord_unlinked": "Discord wurde von deinem SC-Market-Konto getrennt",
  "account_identity_changed.subject.spectrum_cleared": "Die RSI-Verknüpfung deines Kontos wurde entfernt",
  "account_identity_changed.subject.spectrum_set": "Die RSI-Verknüpfung deines Kontos wurde aktualisiert",
  "account_identity_changed.subject.account_deactivated": "Dein SC-Market-Konto wurde deaktiviert",
  "account_identity_changed.subject.discord_link_skipped": "Dein Discord-Konto wurde nicht mit SC Market verknüpft",
  "account_identity_changed.subject.account_reactivated": "Dein SC-Market-Konto wurde reaktiviert",
  "account_identity_changed.body.username_released":
    "Ein Admin hat deinen Benutzernamen freigegeben. Dein Benutzername ist jetzt {username}. Mit „Handle synchronisieren“ in den Einstellungen bekommst du deinen aktuellen RSI-Handle zurück.",
  "account_identity_changed.body.discord_unlinked":
    "Ein Admin hat Discord von deinem Konto getrennt. Du kannst in den Einstellungen wieder ein Discord-Konto verknüpfen.",
  "account_identity_changed.body.spectrum_cleared":
    "Ein Admin hat die RSI-Verknüpfung von deinem Konto entfernt. Verifiziere dein RSI-Konto in den Einstellungen erneut.",
  "account_identity_changed.body.spectrum_set": "Ein Admin hat die RSI-Verknüpfung deines Kontos aktualisiert.",
  "account_identity_changed.body.account_deactivated": "Ein Admin hat dein Konto deaktiviert.",
  "account_identity_changed.body.discord_link_skipped":
    "Dein Discord-Konto ist bereits mit einem anderen SC-Market-Konto verknüpft und wurde deshalb nicht mit diesem verknüpft. Wenn beide Konten dir gehören, wende dich an den SC-Market-Support.",
  "account_identity_changed.body.account_reactivated": "Ein Admin hat dein Konto reaktiviert.",
  "account_identity_changed.security_note":
    "Dies ist ein Sicherheitshinweis zu deinem SC-Market-Konto. Er wird deshalb auch gesendet, wenn du E-Mail-Benachrichtigungen ausgeschaltet hast. Wenn du ihn nicht erwartet hast, wende dich an den SC-Market-Support.",
  "account_identity_changed.action": "Einstellungen öffnen",

  "admin_alert.subject": "Neue Admin-Benachrichtigung: {title}",
  "admin_alert.preheader": "Das SC-Market-Team hat eine Benachrichtigung geschickt: {title}",
  "admin_alert.heading": "Admin-Benachrichtigung",
  "admin_alert.intro": "Das SC-Market-Team hat eine Benachrichtigung geschickt:",
  "admin_alert.action": "Benachrichtigung ansehen",

  "buy_order_filled.subject": "Dein Kaufauftrag wurde erfüllt",
  "buy_order_filled.body":
    "{seller} hat deinen Kaufauftrag erfüllt: {quantity} × {item} für {total} aUEC. Dafür wurde eine Bestellung erstellt.",
  "buy_order_filled.open": "Noch {remaining} gesucht: Dein Kaufauftrag bleibt offen.",
  "buy_order_filled.complete": "Dein Kaufauftrag ist jetzt vollständig erfüllt.",
  "buy_order_filled.action": "Bestellung ansehen",

  "listing_paused_by_wipe.subject": "Deine Inserate wurden für den Wipe pausiert",
  "listing_paused_by_wipe.body": "Deine Inserate wurden für den Wipe pausiert. Stell sie mit einem Tippen wieder ein.",
  "listing_paused_by_wipe.tap": "Stell sie mit einem Tippen wieder ein.",
  "listing_paused_by_wipe.action": "Inserate wieder einstellen",

  "contract_offer_received.subject": "Neues Angebot für deinen Auftrag",
  "contract_offer_received.preheader": "Jemand hat ein Angebot für deinen öffentlichen Auftrag abgegeben.",
  "contract_offer_received.heading": "Neues Angebot für deinen Auftrag",
  "contract_offer_received.intro": "Jemand hat ein Angebot für deinen öffentlichen Auftrag abgegeben:",

  "contractor_invite.subject": "{org} hat dich eingeladen",
  "contractor_invite.preheader": "{org} hat dich zum Beitritt eingeladen.",
  "contractor_invite.heading": "Einladung in eine Org",
  "contractor_invite.intro": "Eine Org hat dich zum Beitritt eingeladen:",
  "contractor_invite.action": "Einladung ansehen",

  "counter_offer_create.subject": "Gegenangebot erhalten",
  "counter_offer_create.preheader": "Die Gegenseite hat dir ein Gegenangebot geschickt.",
  "counter_offer_create.heading": "Gegenangebot",
  "counter_offer_create.intro": "Die Gegenseite hat dir ein Gegenangebot geschickt:",

  "dm_reminder.subject.single": "Du hast eine ungelesene Nachricht auf SC Market",
  "dm_reminder.subject.multiple_other": "Du hast ungelesene Nachrichten in {count} Unterhaltungen auf SC Market",
  "dm_reminder.heading": "Ungelesene Nachrichten",
  "dm_reminder.body.single": "In einer Unterhaltung auf SC Market wartet eine Nachricht auf deine Antwort.",
  "dm_reminder.body.multiple_other": "In {count} Unterhaltungen auf SC Market warten Nachrichten auf deine Antwort.",
  "dm_reminder.nudge": "Lass deine Handelspartner nicht warten: Eine kurze Antwort hält den Handel in Gang.",
  "dm_reminder.action": "Nachrichten ansehen",

  "market_item_bid.subject": "Neues Gebot auf {title}",
  "market_item_bid.preheader": "Jemand hat ein Gebot auf „{title}“ abgegeben.",
  "market_item_bid.heading": "Neues Gebot auf dein Inserat",
  "market_item_bid.intro": "Jemand hat ein Gebot auf dein Inserat abgegeben:",
  "market_item_bid.amount": "Gebot:",

  "market_item_offer.subject": "Neues Angebot für {title}",
  "market_item_offer.preheader": "Jemand hat ein Angebot für „{title}“ gemacht.",
  "market_item_offer.heading": "Neues Angebot für dein Inserat",
  "market_item_offer.intro": "Jemand hat ein Angebot für dein Inserat gemacht:",
  "market_item_offer.amount": "Angebotener Preis:",

  "offer_accepted.subject": "Angebot angenommen",
  "offer_accepted.preheader": "Dein Angebot wurde angenommen.",
  "offer_accepted.heading": "Angebot angenommen",
  "offer_accepted.intro": "Dein Angebot wurde angenommen:",

  "offer_create.subject": "Neues Angebot",
  "offer_create.preheader": "Ein Käufer hat dir ein Angebot geschickt.",
  "offer_create.heading": "Neues Angebot",
  "offer_create.intro": "Ein Käufer hat dir ein Angebot geschickt:",

  "offer_message.subject": "{author} hat dir zu deinem Angebot geschrieben",
  "offer_message.preheader": "{author} hat eine Nachricht zu deinem Angebot geschrieben.",
  "offer_message.heading": "Neue Nachricht zu deinem Angebot",
  "offer_message.intro": "Zu deinem Angebot gibt es eine neue Nachricht:",
  "offer_message.sent": "<b>{author}</b> hat geschrieben:",

  "offer_pending_reminder.subject.single": "Ein Angebot wartet auf deine Antwort",
  "offer_pending_reminder.subject.multiple_other": "{count} Angebote warten auf deine Antwort",
  "offer_pending_reminder.body.single":
    "{buyer} wartet schon {waited} auf eine Antwort zu „{title}“. Nimm an, lehne ab, mach ein Gegenangebot oder antworte im Chat.",
  "offer_pending_reminder.body.multiple_other":
    "{count} Käufer warten auf eine Antwort. Nimm an, lehne ab, mach ein Gegenangebot oder antworte im Chat.",
  "offer_pending_reminder.action": "Auf das Angebot antworten",

  "offer_pending_final_reminder.subject.single": "Letzte Erinnerung: Ein Angebot wartet noch auf deine Antwort",
  "offer_pending_final_reminder.subject.multiple_other": "Letzte Erinnerung: {count} Angebote warten noch auf deine Antwort",
  "offer_pending_final_reminder.body.single":
    "{buyer} wartet schon {waited} auf eine Antwort zu „{title}“. Bleibt das Angebot unbeantwortet, erfährt der Käufer, dass es noch wartet.",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} Käufer warten auf eine Antwort. Bleiben die Angebote unbeantwortet, erfahren die Käufer, dass sie noch warten.",
  "offer_pending_final_reminder.action": "Auf das Angebot antworten",

  "offer_waiting_buyer.subject.single": "Dein Angebot wartet noch auf den Verkäufer",
  "offer_waiting_buyer.subject.multiple_other": "{count} deiner Angebote warten noch auf den Verkäufer",
  "offer_waiting_buyer.body.single":
    "{seller} hat {waited} lang nicht auf „{title}“ geantwortet. Warte weiter, schreib dem Verkäufer oder zieh das Angebot zurück.",
  "offer_waiting_buyer.body.multiple":
    "Die Verkäufer haben seit einigen Tagen nicht geantwortet. Warte weiter, schreib ihnen oder zieh deine Angebote zurück.",
  "offer_waiting_buyer.action": "Dem Verkäufer schreiben",
  "offer_waiting_buyer.withdraw_prompt": "Brauchst du es nicht mehr? <link>Angebot zurückziehen</link>.",
  "offer_waiting_buyer.withdraw": "Angebot zurückziehen",
  "offer_waiting_buyer.keep_waiting": "Wenn du weiter warten möchtest, musst du nichts tun.",

  "offer_rejected.subject": "Angebot abgelehnt",
  "offer_rejected.preheader": "Dein Angebot wurde abgelehnt.",
  "offer_rejected.heading": "Angebot abgelehnt",
  "offer_rejected.intro": "Dein Angebot wurde abgelehnt:",

  "order_assigned.subject": "Bestellung zugewiesen: {title}",
  "order_assigned.preheader": "Dir wurde die Bestellung „{title}“ zugewiesen.",
  "order_assigned.heading": "Dir wurde eine Bestellung zugewiesen",
  "order_assigned.intro": "Diese Bestellung ist jetzt dir zugewiesen:",
  "order_assigned.outro": "Sieh dir die Details der Bestellung an und leg los, sobald du bereit bist.",

  "order_create.subject": "Neue Bestellung: {title}",
  "order_create.preheader": "Ein Kunde hat die Bestellung „{title}“ aufgegeben.",
  "order_create.heading": "Du hast eine neue Bestellung",
  "order_create.intro": "Ein Kunde hat eine Bestellung aufgegeben:",

  "order_message.subject": "{author} hat dir zu „{title}“ geschrieben",
  "order_message.preheader": "{author} hat eine Nachricht zur Bestellung „{title}“ geschrieben.",
  "order_message.heading": "Neue Nachricht zu deiner Bestellung",
  "order_message.intro": "<b>{author}</b> hat eine Nachricht zur Bestellung „{title}“ geschrieben:",
  "order_message.action": "Bestellung ansehen und antworten",

  "order_review.subject": "{author} hat deine Bestellung bewertet",
  "order_review.preheader": "{author} hat deine Bestellung bewertet.",
  "order_review.heading": "Neue Bewertung zu deiner Bestellung",
  "order_review.intro": "{author} hat deine Bestellung bewertet:",
  "order_review.by": "Von:",

  "order_review_revision_requested.subject": "Überarbeitung der Bewertung angefordert",
  "order_review_revision_requested.preheader":
    "Die Gegenseite bittet dich, deine Bewertung der Bestellung „{title}“ zu überarbeiten.",
  "order_review_revision_requested.heading": "Überarbeitung der Bewertung angefordert",
  "order_review_revision_requested.intro":
    "Die Gegenseite bittet dich, deine Bewertung der Bestellung „{title}“ zu überarbeiten:",
  "order_review_revision_requested.your_review": "Deine Bewertung:",
  "order_review_revision_requested.request": "Gewünschte Überarbeitung:",

  "order_status_cancelled.subject": "Bestellung storniert: {title}",
  "order_status_cancelled.heading": "Bestellung storniert",
  "order_status_cancelled.intro": "Die Bestellung „{title}“ wurde storniert.",
  "order_status_fulfilled.subject": "Bestellung erfüllt: {title}",
  "order_status_fulfilled.heading": "Bestellung erfüllt",
  "order_status_fulfilled.intro": "Die Bestellung „{title}“ wurde erfüllt.",
  "order_status_in_progress.subject": "Bestellung in Bearbeitung: {title}",
  "order_status_in_progress.heading": "Bestellung in Bearbeitung",
  "order_status_in_progress.intro": "Die Bestellung „{title}“ ist jetzt in Bearbeitung.",
  "order_status_not_started.subject": "Bestellung in Warteschlange: {title}",
  "order_status_not_started.heading": "Bestellung in Warteschlange",
  "order_status_not_started.intro": "Die Bestellung „{title}“ ist in der Warteschlange.",

  "price_alert.subject": "Preisalarm: {title} für {price} aUEC",
  "price_alert.preheader": "{title} wird für {price} aUEC angeboten, zu oder unter deinem Zielpreis von {target} aUEC.",
  "price_alert.heading": "Preisalarm",
  "price_alert.intro": "Ein Inserat auf deiner Beobachtungsliste hat deinen Zielpreis erreicht:",
  "price_alert.price": "Preis:",
  "price_alert.target": "Dein Zielpreis:",
  "price_alert.quantity": "Menge:",
  "price_alert.seller": "Verkäufer:",

  "staff_storefront_enquiry.subject": "Neue Storefront-Anfrage: {name}",
  "staff_storefront_enquiry.preheader": "{requester} hat {subdomain} angefragt",
  "staff_storefront_enquiry.heading": "Neue Storefront-Anfrage",
  "staff_storefront_enquiry.intro": "{requester} hat beim SC-Market-Team eine eigene Storefront angefragt.",
  "staff_storefront_enquiry.target_org": "Org:",
  "staff_storefront_enquiry.target_shop": "Shop:",
  "staff_storefront_enquiry.requested_by": "Angefragt von:",
  "staff_storefront_enquiry.contact": "Kontakt:",
  "staff_storefront_enquiry.contact_discord": "Discord",
  "staff_storefront_enquiry.contact_message": "Nachricht auf SC Market",
  "staff_storefront_enquiry.action": "Im Admin-Bereich öffnen",

  "storefront_enquiry_accepted.subject": "Storefront-Anfrage angenommen",
  "storefront_enquiry_accepted.preheader":
    "Das SC-Market-Team hat deine Anfrage für eine eigene Storefront für {name} ({subdomain}) angenommen.",
  "storefront_enquiry_accepted.heading": "Storefront-Anfrage angenommen",
  "storefront_enquiry_accepted.intro": "Das SC-Market-Team hat deine Anfrage für eine eigene Storefront angenommen:",
  "storefront_enquiry_accepted.action": "Storefront-Einstellungen öffnen",
  "storefront_enquiry_declined.subject": "Storefront-Anfrage abgelehnt",
  "storefront_enquiry_declined.preheader":
    "Das SC-Market-Team hat deine Anfrage für eine eigene Storefront für {name} ({subdomain}) abgelehnt.",
  "storefront_enquiry_declined.heading": "Storefront-Anfrage abgelehnt",
  "storefront_enquiry_declined.intro": "Das SC-Market-Team hat deine Anfrage für eine eigene Storefront abgelehnt:",
  "storefront_enquiry_declined.retry": "Du kannst in deinen Storefront-Einstellungen eine neue Anfrage senden.",
  "storefront_enquiry_declined.action": "Storefront-Einstellungen öffnen",

  "verification.subject": "Bestätige deine E-Mail-Adresse für SC Market",
  "verification.preheader": "Bestätige diese Adresse, um E-Mails von SC Market zu erhalten.",
  "verification.heading": "Bestätige deine E-Mail-Adresse",
  "verification.intro":
    "Danke, dass du deine E-Mail-Adresse zu deinem SC-Market-Konto hinzugefügt hast. Bitte bestätige sie mit einem Klick auf die Schaltfläche:",
  "verification.intro_text":
    "Danke, dass du deine E-Mail-Adresse zu deinem SC-Market-Konto hinzugefügt hast. Bitte bestätige sie über diesen Link:",
  "verification.action": "E-Mail-Adresse bestätigen",
  "verification.copy_link": "Oder kopiere diesen Link in deinen Browser:",
  "verification.expires": "Dieser Bestätigungslink ist 24 Stunden gültig.",
  "verification.ignore": "Wenn du diese E-Mail nicht angefordert hast, kannst du sie einfach ignorieren.",
}

export default de
