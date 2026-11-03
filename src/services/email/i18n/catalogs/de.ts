/** German email strings (see ../index.ts; keys and placeholders as in en.ts). */
const de: Record<string, string> = {
  "layout.unsubscribe": "Abmelden",
  "layout.manage_preferences": "Einstellungen verwalten",
  "layout.defaults_notice":
    "Wir haben E-Mails zu Bestellungen, Angeboten und ungelesenen Nachrichten für Sie eingeschaltet. Mit einem Klick ausschalten:",
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

  "account_identity_changed.subject.username_released": "Ihr SC-Market-Benutzername wurde geändert",
  "account_identity_changed.subject.discord_unlinked": "Discord wurde von Ihrem SC-Market-Konto getrennt",
  "account_identity_changed.subject.spectrum_cleared": "Die RSI-Verknüpfung Ihres Kontos wurde entfernt",
  "account_identity_changed.subject.spectrum_set": "Die RSI-Verknüpfung Ihres Kontos wurde aktualisiert",
  "account_identity_changed.subject.account_deactivated": "Ihr SC-Market-Konto wurde deaktiviert",
  "account_identity_changed.subject.discord_link_skipped": "Ihr Discord-Konto wurde nicht mit SC Market verknüpft",
  "account_identity_changed.subject.account_reactivated": "Ihr SC-Market-Konto wurde reaktiviert",
  "account_identity_changed.body.username_released":
    "Ein Admin hat Ihren Benutzernamen freigegeben. Ihr Benutzername ist jetzt {username}. Mit „Handle synchronisieren“ in den Einstellungen erhalten Sie Ihren aktuellen RSI-Handle zurück.",
  "account_identity_changed.body.discord_unlinked":
    "Ein Admin hat Discord von Ihrem Konto getrennt. Sie können in den Einstellungen wieder ein Discord-Konto verknüpfen.",
  "account_identity_changed.body.spectrum_cleared":
    "Ein Admin hat die RSI-Verknüpfung von Ihrem Konto entfernt. Verifizieren Sie Ihr RSI-Konto in den Einstellungen erneut.",
  "account_identity_changed.body.spectrum_set": "Ein Admin hat die RSI-Verknüpfung Ihres Kontos aktualisiert.",
  "account_identity_changed.body.account_deactivated": "Ein Admin hat Ihr Konto deaktiviert.",
  "account_identity_changed.body.discord_link_skipped":
    "Ihr Discord-Konto ist bereits mit einem anderen SC-Market-Konto verknüpft und wurde deshalb nicht mit diesem verknüpft. Wenn beide Konten Ihnen gehören, wenden Sie sich an den SC-Market-Support.",
  "account_identity_changed.body.account_reactivated": "Ein Admin hat Ihr Konto reaktiviert.",
  "account_identity_changed.security_note":
    "Dies ist ein Sicherheitshinweis zu Ihrem SC-Market-Konto. Er wird deshalb auch gesendet, wenn Sie E-Mail-Benachrichtigungen ausgeschaltet haben. Wenn Sie ihn nicht erwartet haben, wenden Sie sich an den SC-Market-Support.",
  "account_identity_changed.action": "Einstellungen öffnen",

  "admin_alert.subject": "Admin-Benachrichtigung",
  "admin_alert.preheader": "Sie haben eine neue Admin-Benachrichtigung: {title}",
  "admin_alert.heading": "Admin-Benachrichtigung",
  "admin_alert.intro": "Sie haben eine neue Admin-Benachrichtigung:",
  "admin_alert.action": "Benachrichtigung ansehen",

  "buy_order_filled.subject": "Ihr Kaufauftrag wurde erfüllt",
  "buy_order_filled.body":
    "{seller} hat Ihren Kaufauftrag erfüllt: {quantity} × {item} für {total} aUEC. Dafür wurde eine Bestellung erstellt.",
  "buy_order_filled.open": "Noch {remaining} gesucht: Ihr Kaufauftrag bleibt offen.",
  "buy_order_filled.complete": "Ihr Kaufauftrag ist jetzt vollständig erfüllt.",
  "buy_order_filled.action": "Bestellung ansehen",

  "contract_offer_received.subject": "Neues Angebot für Ihren Auftrag",
  "contract_offer_received.preheader": "Jemand hat ein Angebot für Ihren öffentlichen Auftrag abgegeben.",
  "contract_offer_received.heading": "Neues Angebot für Ihren Auftrag",
  "contract_offer_received.intro": "Jemand hat ein Angebot für Ihren öffentlichen Auftrag abgegeben:",

  "contractor_invite.subject": "Auftragnehmer-Einladung",
  "contractor_invite.preheader": "Sie wurden eingeladen, {org} beizutreten.",
  "contractor_invite.heading": "Auftragnehmer-Einladung",
  "contractor_invite.intro": "Sie wurden eingeladen, einer Auftragnehmer-Organisation beizutreten.",
  "contractor_invite.action": "Einladung ansehen",

  "counter_offer_create.subject": "Gegenangebot erhalten",
  "counter_offer_create.preheader": "Sie haben ein Gegenangebot erhalten.",
  "counter_offer_create.heading": "Gegenangebot erhalten",
  "counter_offer_create.intro": "Es wurde ein Gegenangebot erstellt:",

  "dm_reminder.subject.single": "Sie haben eine ungelesene Nachricht auf SC Market",
  "dm_reminder.subject.multiple_other": "Sie haben ungelesene Nachrichten in {count} Unterhaltungen auf SC Market",
  "dm_reminder.heading": "Ungelesene Nachrichten",
  "dm_reminder.body.single": "In einer Unterhaltung auf SC Market wartet eine Nachricht auf Ihre Antwort.",
  "dm_reminder.body.multiple_other": "In {count} Unterhaltungen auf SC Market warten Nachrichten auf Ihre Antwort.",
  "dm_reminder.nudge": "Lassen Sie Ihre Handelspartner nicht warten: Eine kurze Antwort hält den Handel in Gang.",
  "dm_reminder.action": "Nachrichten ansehen",

  "market_item_bid.subject": "Neues Gebot auf Ihr Inserat",
  "market_item_bid.preheader": "Jemand hat ein Gebot auf „{title}“ abgegeben.",
  "market_item_bid.heading": "Neues Gebot auf Ihr Inserat",
  "market_item_bid.intro": "Jemand hat ein Gebot auf Ihr Inserat abgegeben:",
  "market_item_bid.amount": "Gebot:",

  "market_item_offer.subject": "Neues Angebot für Ihr Inserat",
  "market_item_offer.preheader": "Jemand hat ein Angebot für „{title}“ gemacht.",
  "market_item_offer.heading": "Neues Angebot für Ihr Inserat",
  "market_item_offer.intro": "Jemand hat ein Angebot für Ihr Inserat gemacht:",
  "market_item_offer.amount": "Angebotener Preis:",

  "offer_accepted.subject": "Angebot angenommen",
  "offer_accepted.preheader": "Ihr Angebot wurde angenommen.",
  "offer_accepted.heading": "Angebot angenommen",
  "offer_accepted.intro": "Ihr Angebot wurde angenommen:",

  "offer_create.subject": "Neues Angebot",
  "offer_create.preheader": "Ein neues Angebot wurde erstellt.",
  "offer_create.heading": "Neues Angebot",
  "offer_create.intro": "Ein neues Angebot wurde erstellt:",

  "offer_message.subject": "Neue Nachricht zu einem Angebot",
  "offer_message.preheader": "{author} hat eine Nachricht zu Ihrem Angebot geschrieben.",
  "offer_message.heading": "Neue Nachricht zu einem Angebot",
  "offer_message.intro": "Zu Ihrem Angebot wurde eine neue Nachricht geschrieben:",
  "offer_message.sent": "<b>{author}</b> hat geschrieben:",

  "offer_pending_reminder.subject.single": "Ein Angebot wartet auf Ihre Antwort",
  "offer_pending_reminder.subject.multiple_other": "{count} Angebote warten auf Ihre Antwort",
  "offer_pending_reminder.body.single":
    "{buyer} wartet schon {waited} auf eine Antwort zu „{title}“. Nehmen Sie an, lehnen Sie ab, machen Sie ein Gegenangebot oder antworten Sie im Chat.",
  "offer_pending_reminder.body.multiple_other":
    "{count} Käufer warten auf eine Antwort. Nehmen Sie an, lehnen Sie ab, machen Sie ein Gegenangebot oder antworten Sie im Chat.",
  "offer_pending_reminder.action": "Auf das Angebot antworten",

  "offer_pending_final_reminder.subject.single": "Letzte Erinnerung: Ein Angebot wartet noch auf Ihre Antwort",
  "offer_pending_final_reminder.subject.multiple_other": "Letzte Erinnerung: {count} Angebote warten noch auf Ihre Antwort",
  "offer_pending_final_reminder.body.single":
    "{buyer} wartet schon {waited} auf eine Antwort zu „{title}“. Bleibt das Angebot unbeantwortet, erfährt der Käufer, dass es noch wartet.",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} Käufer warten auf eine Antwort. Bleiben die Angebote unbeantwortet, erfahren die Käufer, dass sie noch warten.",
  "offer_pending_final_reminder.action": "Auf das Angebot antworten",

  "offer_waiting_buyer.subject.single": "Ihr Angebot wartet noch auf den Verkäufer",
  "offer_waiting_buyer.subject.multiple_other": "{count} Ihrer Angebote warten noch auf den Verkäufer",
  "offer_waiting_buyer.body.single":
    "{seller} hat {waited} lang nicht auf „{title}“ geantwortet. Warten Sie weiter, schreiben Sie dem Verkäufer oder ziehen Sie das Angebot zurück.",
  "offer_waiting_buyer.body.multiple":
    "Die Verkäufer haben seit einigen Tagen nicht geantwortet. Warten Sie weiter, schreiben Sie ihnen oder ziehen Sie Ihre Angebote zurück.",
  "offer_waiting_buyer.action": "Dem Verkäufer schreiben",
  "offer_waiting_buyer.withdraw_prompt": "Brauchen Sie es nicht mehr? <link>Angebot zurückziehen</link>.",
  "offer_waiting_buyer.withdraw": "Angebot zurückziehen",
  "offer_waiting_buyer.keep_waiting": "Wenn Sie weiter warten möchten, müssen Sie nichts tun.",

  "offer_rejected.subject": "Angebot abgelehnt",
  "offer_rejected.preheader": "Ihr Angebot wurde abgelehnt.",
  "offer_rejected.heading": "Angebot abgelehnt",
  "offer_rejected.intro": "Ihr Angebot wurde abgelehnt:",

  "order_assigned.subject": "Bestellung zugewiesen",
  "order_assigned.preheader": "Ihnen wurde die Bestellung „{title}“ zugewiesen.",
  "order_assigned.heading": "Ihnen wurde eine Bestellung zugewiesen",
  "order_assigned.intro": "Ihnen wurde eine neue Bestellung zugewiesen:",
  "order_assigned.outro": "Sehen Sie sich die Details der Bestellung an und legen Sie los, sobald Sie bereit sind.",

  "order_create.subject": "Neue Bestellung",
  "order_create.preheader": "Die neue Bestellung „{title}“ wurde erstellt.",
  "order_create.heading": "Neue Bestellung",
  "order_create.intro": "Eine neue Bestellung wurde erstellt:",

  "order_message.subject": "Neue Nachricht zu einer Bestellung",
  "order_message.preheader": "{author} hat eine Nachricht zur Bestellung „{title}“ geschrieben.",
  "order_message.heading": "Neue Nachricht zu einer Bestellung",
  "order_message.intro": "<b>{author}</b> hat eine Nachricht zur Bestellung „{title}“ geschrieben:",
  "order_message.action": "Bestellung ansehen und antworten",

  "order_review.subject": "Neue Bewertung zu einer Bestellung",
  "order_review.preheader": "{author} hat Ihre Bestellung bewertet.",
  "order_review.heading": "Neue Bewertung",
  "order_review.intro": "Für Ihre Bestellung wurde eine neue Bewertung abgegeben:",
  "order_review.by": "Von:",

  "order_review_revision_requested.subject": "Überarbeitung der Bewertung angefordert",
  "order_review_revision_requested.preheader":
    "Für Ihre Bewertung der Bestellung „{title}“ wurde eine Überarbeitung angefordert.",
  "order_review_revision_requested.heading": "Überarbeitung der Bewertung angefordert",
  "order_review_revision_requested.intro":
    "Für Ihre Bewertung der Bestellung „{title}“ wurde eine Überarbeitung angefordert:",
  "order_review_revision_requested.your_review": "Ihre Bewertung:",
  "order_review_revision_requested.request": "Gewünschte Überarbeitung:",

  "order_status_cancelled.subject": "Bestellung storniert",
  "order_status_cancelled.heading": "Bestellung storniert",
  "order_status_cancelled.intro": "Die Bestellung „{title}“ wurde storniert.",
  "order_status_fulfilled.subject": "Bestellung erfüllt",
  "order_status_fulfilled.heading": "Bestellung erfüllt",
  "order_status_fulfilled.intro": "Die Bestellung „{title}“ wurde erfüllt.",
  "order_status_in_progress.subject": "Bestellung in Bearbeitung",
  "order_status_in_progress.heading": "Bestellung in Bearbeitung",
  "order_status_in_progress.intro": "Die Bestellung „{title}“ ist jetzt in Bearbeitung.",
  "order_status_not_started.subject": "Bestellstatus aktualisiert",
  "order_status_not_started.heading": "Bestellung in Warteschlange",
  "order_status_not_started.intro": "Der Status der Bestellung „{title}“ wurde auf „In Warteschlange“ geändert.",

  "price_alert.subject": "Preisalarm: {title} für {price} aUEC",
  "price_alert.preheader": "{title} wird für {price} aUEC angeboten, zu oder unter Ihrem Zielpreis von {target} aUEC.",
  "price_alert.heading": "Preisalarm",
  "price_alert.intro": "Ein Inserat auf Ihrer Beobachtungsliste hat Ihren Zielpreis erreicht:",
  "price_alert.price": "Preis:",
  "price_alert.target": "Ihr Zielpreis:",
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
    "Das SC-Market-Team hat Ihre Anfrage für eine eigene Storefront für {name} ({subdomain}) angenommen.",
  "storefront_enquiry_accepted.heading": "Storefront-Anfrage angenommen",
  "storefront_enquiry_accepted.intro": "Das SC-Market-Team hat Ihre Anfrage für eine eigene Storefront angenommen:",
  "storefront_enquiry_accepted.action": "Storefront-Einstellungen öffnen",
  "storefront_enquiry_declined.subject": "Storefront-Anfrage abgelehnt",
  "storefront_enquiry_declined.preheader":
    "Das SC-Market-Team hat Ihre Anfrage für eine eigene Storefront für {name} ({subdomain}) abgelehnt.",
  "storefront_enquiry_declined.heading": "Storefront-Anfrage abgelehnt",
  "storefront_enquiry_declined.intro": "Das SC-Market-Team hat Ihre Anfrage für eine eigene Storefront abgelehnt:",
  "storefront_enquiry_declined.retry": "Sie können in Ihren Storefront-Einstellungen eine neue Anfrage senden.",
  "storefront_enquiry_declined.action": "Storefront-Einstellungen öffnen",

  "verification.subject": "Bestätigen Sie Ihre E-Mail-Adresse – SC Market",
  "verification.preheader": "Bestätigen Sie diese Adresse, um E-Mails von SC Market zu erhalten.",
  "verification.heading": "Bestätigen Sie Ihre E-Mail-Adresse",
  "verification.intro":
    "Danke, dass Sie Ihre E-Mail-Adresse zu Ihrem SC-Market-Konto hinzugefügt haben. Bitte bestätigen Sie sie mit einem Klick auf die Schaltfläche:",
  "verification.intro_text":
    "Danke, dass Sie Ihre E-Mail-Adresse zu Ihrem SC-Market-Konto hinzugefügt haben. Bitte bestätigen Sie sie über diesen Link:",
  "verification.action": "E-Mail-Adresse bestätigen",
  "verification.copy_link": "Oder kopieren Sie diesen Link in Ihren Browser:",
  "verification.expires": "Dieser Bestätigungslink ist 24 Stunden gültig.",
  "verification.ignore": "Wenn Sie diese E-Mail nicht angefordert haben, können Sie sie einfach ignorieren.",
}

export default de
