/** French email strings (see ../index.ts; keys and placeholders as in en.ts). */
const fr: Record<string, string> = {
  "layout.unsubscribe": "Se désabonner",
  "layout.manage_preferences": "Gérer les préférences",
  "layout.defaults_notice":
    "Nous avons activé les e-mails pour les mises à jour de commandes, les offres et les messages non lus. Désactivez-les en un clic :",
  "layout.turn_off": "Désactiver ces e-mails",

  "common.greeting": "Bonjour {name},",
  "common.status": "Statut :",
  "common.value": "Valeur :",
  "common.rating": "Note :",
  "common.message": "Message :",
  "common.subdomain": "Sous-domaine :",
  "common.offer_number": "Offre n° {id}",
  "common.untitled": "Sans titre",
  "common.view_order": "Voir la commande",
  "common.view_offer": "Voir l'offre",
  "common.view_listing": "Voir l'annonce",
  "common.and_more": "…et {count} autres",
  "common.duration_days_one": "{count} jour",
  "common.duration_days_other": "{count} jours",
  "common.duration_hours_one": "{count} heure",
  "common.duration_hours_other": "{count} heures",

  "status.order.not-started": "En file d'attente",
  "status.order.in-progress": "En cours de traitement",
  "status.order.fulfilled": "Honorée",
  "status.order.cancelled": "Annulée",
  "status.offer.active": "Active",
  "status.offer.closed": "Clôturée",

  "account_identity_changed.subject.username_released": "Votre nom d'utilisateur SC Market a été modifié",
  "account_identity_changed.subject.discord_unlinked": "Discord a été dissocié de votre compte SC Market",
  "account_identity_changed.subject.spectrum_cleared": "Le lien RSI de votre compte a été retiré",
  "account_identity_changed.subject.spectrum_set": "Le lien RSI de votre compte a été mis à jour",
  "account_identity_changed.subject.account_deactivated": "Votre compte SC Market a été désactivé",
  "account_identity_changed.subject.discord_link_skipped": "Votre Discord n'a pas été associé à SC Market",
  "account_identity_changed.subject.account_reactivated": "Votre compte SC Market a été réactivé",
  "account_identity_changed.body.username_released":
    "Un admin a libéré votre nom d'utilisateur. Votre nom d'utilisateur est maintenant {username}. Utilisez « Synchroniser le pseudo » dans les paramètres pour récupérer votre pseudo RSI actuel.",
  "account_identity_changed.body.discord_unlinked":
    "Un admin a dissocié Discord de votre compte. Vous pouvez associer de nouveau un compte Discord dans les paramètres.",
  "account_identity_changed.body.spectrum_cleared":
    "Un admin a retiré le lien RSI de votre compte. Vérifiez de nouveau votre compte RSI dans les paramètres.",
  "account_identity_changed.body.spectrum_set": "Un admin a mis à jour le lien RSI de votre compte.",
  "account_identity_changed.body.account_deactivated": "Un admin a désactivé votre compte.",
  "account_identity_changed.body.discord_link_skipped":
    "Votre compte Discord est déjà associé à un autre compte SC Market, il n'a donc pas été associé à celui-ci. Si les deux comptes vous appartiennent, contactez le support SC Market.",
  "account_identity_changed.body.account_reactivated": "Un admin a réactivé votre compte.",
  "account_identity_changed.security_note":
    "Ceci est un avis de sécurité concernant votre compte SC Market : il est envoyé même si vous avez désactivé les notifications par e-mail. Si vous ne vous y attendiez pas, contactez le support SC Market.",
  "account_identity_changed.action": "Ouvrir les paramètres",

  "admin_alert.subject": "Alerte administrateur",
  "admin_alert.preheader": "Vous avez une nouvelle alerte administrateur : {title}",
  "admin_alert.heading": "Alerte administrateur",
  "admin_alert.intro": "Vous avez une nouvelle alerte administrateur :",
  "admin_alert.action": "Voir l'alerte",

  "buy_order_filled.subject": "Votre ordre d'achat a été honoré",
  "buy_order_filled.body":
    "{seller} a honoré votre ordre d'achat : {quantity} × {item} pour {total} aUEC. Une commande a été créée.",
  "buy_order_filled.open": "Il en manque encore {remaining} : votre ordre d'achat reste ouvert.",
  "buy_order_filled.complete": "Votre ordre d'achat est maintenant entièrement honoré.",
  "buy_order_filled.action": "Voir la commande",

  "contract_offer_received.subject": "Nouvelle offre sur votre contrat",
  "contract_offer_received.preheader": "Quelqu'un a fait une offre sur votre contrat public.",
  "contract_offer_received.heading": "Nouvelle offre sur votre contrat",
  "contract_offer_received.intro": "Quelqu'un a fait une offre sur votre contrat public :",

  "contractor_invite.subject": "Invitation d'organisation",
  "contractor_invite.preheader": "Vous avez été invité à rejoindre {org}.",
  "contractor_invite.heading": "Invitation d'organisation",
  "contractor_invite.intro": "Vous avez été invité à rejoindre une organisation.",
  "contractor_invite.action": "Voir l'invitation",

  "counter_offer_create.subject": "Contre-offre reçue",
  "counter_offer_create.preheader": "Vous avez reçu une contre-offre.",
  "counter_offer_create.heading": "Contre-offre reçue",
  "counter_offer_create.intro": "Une contre-offre a été créée :",

  "dm_reminder.subject.single": "Vous avez un message non lu sur SC Market",
  "dm_reminder.subject.multiple_other": "Vous avez des messages non lus dans {count} conversations sur SC Market",
  "dm_reminder.heading": "Messages non lus",
  "dm_reminder.body.single": "Une conversation sur SC Market a un message qui attend votre réponse.",
  "dm_reminder.body.multiple_other": "{count} conversations sur SC Market ont des messages qui attendent votre réponse.",
  "dm_reminder.nudge": "Ne faites pas attendre vos partenaires commerciaux : une réponse rapide fait avancer l'échange.",
  "dm_reminder.action": "Voir les messages",

  "market_item_bid.subject": "Nouvelle enchère sur votre annonce",
  "market_item_bid.preheader": "Quelqu'un a enchéri sur « {title} ».",
  "market_item_bid.heading": "Nouvelle enchère sur votre annonce",
  "market_item_bid.intro": "Quelqu'un a enchéri sur votre annonce :",
  "market_item_bid.amount": "Montant de l'enchère :",

  "market_item_offer.subject": "Nouvelle offre sur votre annonce",
  "market_item_offer.preheader": "Quelqu'un a fait une offre sur « {title} ».",
  "market_item_offer.heading": "Nouvelle offre sur votre annonce",
  "market_item_offer.intro": "Quelqu'un a fait une offre sur votre annonce :",
  "market_item_offer.amount": "Montant de l'offre :",

  "offer_accepted.subject": "Offre acceptée",
  "offer_accepted.preheader": "Votre offre a été acceptée.",
  "offer_accepted.heading": "Offre acceptée",
  "offer_accepted.intro": "Votre offre a été acceptée :",

  "offer_create.subject": "Nouvelle offre",
  "offer_create.preheader": "Une nouvelle offre a été créée.",
  "offer_create.heading": "Nouvelle offre",
  "offer_create.intro": "Une nouvelle offre a été créée :",

  "offer_message.subject": "Nouveau message sur une offre",
  "offer_message.preheader": "{author} a envoyé un message sur votre offre.",
  "offer_message.heading": "Nouveau message sur une offre",
  "offer_message.intro": "Un nouveau message a été envoyé sur votre offre :",
  "offer_message.sent": "<b>{author}</b> a écrit :",

  "offer_pending_reminder.subject.single": "Une offre attend votre réponse",
  "offer_pending_reminder.subject.multiple_other": "{count} offres attendent votre réponse",
  "offer_pending_reminder.body.single":
    "{buyer} attend une réponse à « {title} » depuis {waited}. Acceptez, refusez, faites une contre-offre ou répondez dans le chat.",
  "offer_pending_reminder.body.multiple_other":
    "{count} acheteurs attendent une réponse. Acceptez, refusez, faites une contre-offre ou répondez dans le chat.",
  "offer_pending_reminder.action": "Répondre à l'offre",

  "offer_pending_final_reminder.subject.single": "Dernier rappel : une offre attend toujours votre réponse",
  "offer_pending_final_reminder.subject.multiple_other": "Dernier rappel : {count} offres attendent toujours votre réponse",
  "offer_pending_final_reminder.body.single":
    "{buyer} attend une réponse à « {title} » depuis {waited}. Sans réponse, l'acheteur sera prévenu que son offre attend toujours.",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} acheteurs attendent une réponse. Sans réponse, les acheteurs seront prévenus que leurs offres attendent toujours.",
  "offer_pending_final_reminder.action": "Répondre à l'offre",

  "offer_waiting_buyer.subject.single": "Votre offre attend toujours le vendeur",
  "offer_waiting_buyer.subject.multiple_other": "{count} de vos offres attendent toujours le vendeur",
  "offer_waiting_buyer.body.single":
    "{seller} n'a pas répondu à « {title} » depuis {waited}. Vous pouvez continuer d'attendre, écrire au vendeur ou retirer l'offre.",
  "offer_waiting_buyer.body.multiple":
    "Les vendeurs n'ont pas répondu depuis quelques jours. Vous pouvez continuer d'attendre, leur écrire ou retirer vos offres.",
  "offer_waiting_buyer.action": "Écrire au vendeur",
  "offer_waiting_buyer.withdraw_prompt": "Vous n'en avez plus besoin ? <link>Retirez l'offre</link>.",
  "offer_waiting_buyer.withdraw": "Retirer l'offre",
  "offer_waiting_buyer.keep_waiting": "Pour continuer d'attendre, vous n'avez rien à faire.",

  "offer_rejected.subject": "Offre refusée",
  "offer_rejected.preheader": "Votre offre a été refusée.",
  "offer_rejected.heading": "Offre refusée",
  "offer_rejected.intro": "Votre offre a été refusée :",

  "order_assigned.subject": "Commande assignée",
  "order_assigned.preheader": "La commande « {title} » vous a été assignée.",
  "order_assigned.heading": "Une commande vous a été assignée",
  "order_assigned.intro": "Une nouvelle commande vous a été assignée :",
  "order_assigned.outro": "Consultez les détails de la commande et commencez quand vous êtes prêt.",

  "order_create.subject": "Nouvelle commande",
  "order_create.preheader": "La nouvelle commande « {title} » a été créée.",
  "order_create.heading": "Nouvelle commande",
  "order_create.intro": "Une nouvelle commande a été créée :",

  "order_message.subject": "Nouveau message sur une commande",
  "order_message.preheader": "{author} a envoyé un message sur la commande « {title} ».",
  "order_message.heading": "Nouveau message sur une commande",
  "order_message.intro": "<b>{author}</b> a envoyé un message sur la commande « {title} » :",
  "order_message.action": "Voir la commande et répondre",

  "order_review.subject": "Nouvel avis sur une commande",
  "order_review.preheader": "{author} a laissé un avis sur votre commande.",
  "order_review.heading": "Nouvel avis",
  "order_review.intro": "Un nouvel avis a été publié sur votre commande :",
  "order_review.by": "Par :",

  "order_review_revision_requested.subject": "Révision d'avis demandée",
  "order_review_revision_requested.preheader": "Une révision de votre avis sur la commande « {title} » a été demandée.",
  "order_review_revision_requested.heading": "Révision d'avis demandée",
  "order_review_revision_requested.intro": "Une révision de votre avis sur la commande « {title} » a été demandée :",
  "order_review_revision_requested.your_review": "Votre avis :",
  "order_review_revision_requested.request": "Révision demandée :",

  "order_status_cancelled.subject": "Commande annulée",
  "order_status_cancelled.heading": "Commande annulée",
  "order_status_cancelled.intro": "La commande « {title} » a été annulée.",
  "order_status_fulfilled.subject": "Commande honorée",
  "order_status_fulfilled.heading": "Commande honorée",
  "order_status_fulfilled.intro": "La commande « {title} » a été honorée.",
  "order_status_in_progress.subject": "Commande en cours de traitement",
  "order_status_in_progress.heading": "Commande en cours de traitement",
  "order_status_in_progress.intro": "La commande « {title} » est maintenant en cours de traitement.",
  "order_status_not_started.subject": "Statut de commande mis à jour",
  "order_status_not_started.heading": "Commande en file d'attente",
  "order_status_not_started.intro": "Le statut de la commande « {title} » est passé à « En file d'attente ».",

  "price_alert.subject": "Alerte de prix : {title} à {price} aUEC",
  "price_alert.preheader": "{title} est en vente à {price} aUEC, à votre prix cible de {target} aUEC ou moins.",
  "price_alert.heading": "Alerte de prix",
  "price_alert.intro": "Une annonce de votre liste de suivi a atteint votre prix cible :",
  "price_alert.price": "Prix :",
  "price_alert.target": "Votre prix cible :",
  "price_alert.quantity": "Quantité :",
  "price_alert.seller": "Vendeur :",

  "staff_storefront_enquiry.subject": "Nouvelle demande de vitrine : {name}",
  "staff_storefront_enquiry.preheader": "{requester} a demandé {subdomain}",
  "staff_storefront_enquiry.heading": "Nouvelle demande de vitrine",
  "staff_storefront_enquiry.intro": "{requester} a demandé à l'équipe SC Market une vitrine à ses couleurs.",
  "staff_storefront_enquiry.target_org": "Org :",
  "staff_storefront_enquiry.target_shop": "Boutique :",
  "staff_storefront_enquiry.requested_by": "Demandé par :",
  "staff_storefront_enquiry.contact": "Contact :",
  "staff_storefront_enquiry.contact_discord": "Discord",
  "staff_storefront_enquiry.contact_message": "Message sur SC Market",
  "staff_storefront_enquiry.action": "Ouvrir dans l'admin",

  "storefront_enquiry_accepted.subject": "Demande de vitrine acceptée",
  "storefront_enquiry_accepted.preheader":
    "L'équipe SC Market a accepté votre demande de vitrine à vos couleurs pour {name} ({subdomain}).",
  "storefront_enquiry_accepted.heading": "Demande de vitrine acceptée",
  "storefront_enquiry_accepted.intro": "L'équipe SC Market a accepté votre demande de vitrine à vos couleurs :",
  "storefront_enquiry_accepted.action": "Ouvrir les paramètres de la vitrine",
  "storefront_enquiry_declined.subject": "Demande de vitrine refusée",
  "storefront_enquiry_declined.preheader":
    "L'équipe SC Market a refusé votre demande de vitrine à vos couleurs pour {name} ({subdomain}).",
  "storefront_enquiry_declined.heading": "Demande de vitrine refusée",
  "storefront_enquiry_declined.intro": "L'équipe SC Market a refusé votre demande de vitrine à vos couleurs :",
  "storefront_enquiry_declined.retry": "Vous pouvez envoyer une nouvelle demande depuis les paramètres de votre vitrine.",
  "storefront_enquiry_declined.action": "Ouvrir les paramètres de la vitrine",

  "verification.subject": "Vérifiez votre adresse e-mail - SC Market",
  "verification.preheader": "Confirme cette adresse pour recevoir les e-mails de SC Market.",
  "verification.heading": "Vérifiez votre adresse e-mail",
  "verification.intro":
    "Merci d'avoir ajouté votre adresse e-mail à votre compte SC Market. Vérifiez-la en cliquant sur le bouton ci-dessous :",
  "verification.intro_text":
    "Merci d'avoir ajouté votre adresse e-mail à votre compte SC Market. Vérifiez-la en ouvrant le lien ci-dessous :",
  "verification.action": "Vérifier l'adresse e-mail",
  "verification.copy_link": "Ou copiez et collez ce lien dans votre navigateur :",
  "verification.expires": "Ce lien de vérification expire dans 24 heures.",
  "verification.ignore": "Si vous n'avez pas demandé cet e-mail, vous pouvez l'ignorer.",
}

export default fr
