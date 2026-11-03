/** Spanish email strings (see ../index.ts; keys and placeholders as in en.ts). */
const es: Record<string, string> = {
  "layout.unsubscribe": "Cancelar suscripción",
  "layout.manage_preferences": "Gestionar preferencias",
  "layout.defaults_notice":
    "Activamos el correo para novedades de pedidos, ofertas y mensajes sin leer. Desactívalo con un clic:",
  "layout.turn_off": "Desactivar estos correos",

  "common.greeting": "Hola, {name}:",
  "common.status": "Estado:",
  "common.value": "Valor:",
  "common.rating": "Valoración:",
  "common.message": "Mensaje:",
  "common.subdomain": "Subdominio:",
  "common.offer_number": "Oferta n.º {id}",
  "common.untitled": "Sin título",
  "common.view_order": "Ver pedido",
  "common.view_offer": "Ver oferta",
  "common.view_listing": "Ver anuncio",
  "common.and_more": "…y {count} más",
  "common.duration_days_one": "{count} día",
  "common.duration_days_other": "{count} días",
  "common.duration_hours_one": "{count} hora",
  "common.duration_hours_other": "{count} horas",

  "status.order.not-started": "En cola",
  "status.order.in-progress": "En curso",
  "status.order.fulfilled": "Completado",
  "status.order.cancelled": "Cancelado",
  "status.offer.active": "Activa",
  "status.offer.closed": "Cerrada",

  "account_identity_changed.subject.username_released": "Se cambió tu nombre de usuario de SC Market",
  "account_identity_changed.subject.discord_unlinked": "Se desvinculó Discord de tu cuenta de SC Market",
  "account_identity_changed.subject.spectrum_cleared": "Se quitó el vínculo de RSI de tu cuenta",
  "account_identity_changed.subject.spectrum_set": "Se actualizó el vínculo de RSI de tu cuenta",
  "account_identity_changed.subject.account_deactivated": "Se desactivó tu cuenta de SC Market",
  "account_identity_changed.subject.discord_link_skipped": "Tu Discord no se vinculó a SC Market",
  "account_identity_changed.subject.account_reactivated": "Se reactivó tu cuenta de SC Market",
  "account_identity_changed.body.username_released":
    "Un admin liberó tu nombre de usuario. Ahora tu nombre de usuario es {username}. Usa «Sincronizar handle» en Configuración para recuperar tu handle actual de RSI.",
  "account_identity_changed.body.discord_unlinked":
    "Un admin desvinculó Discord de tu cuenta. Puedes vincular de nuevo una cuenta de Discord en Configuración.",
  "account_identity_changed.body.spectrum_cleared":
    "Un admin quitó el vínculo de RSI de tu cuenta. Vuelve a verificar tu cuenta de RSI en Configuración.",
  "account_identity_changed.body.spectrum_set": "Un admin actualizó el vínculo de RSI de tu cuenta.",
  "account_identity_changed.body.account_deactivated": "Un admin desactivó tu cuenta.",
  "account_identity_changed.body.discord_link_skipped":
    "Tu cuenta de Discord ya está vinculada a otra cuenta de SC Market, así que no se vinculó a esta. Si ambas cuentas son tuyas, contacta con el soporte de SC Market.",
  "account_identity_changed.body.account_reactivated": "Un admin reactivó tu cuenta.",
  "account_identity_changed.security_note":
    "Este es un aviso de seguridad sobre tu cuenta de SC Market, por eso se envía aunque hayas desactivado las notificaciones por correo. Si no lo esperabas, contacta con el soporte de SC Market.",
  "account_identity_changed.action": "Abrir Configuración",

  "admin_alert.subject": "Alerta de administración",
  "admin_alert.preheader": "Tienes una nueva alerta de administración: {title}",
  "admin_alert.heading": "Alerta de administración",
  "admin_alert.intro": "Tienes una nueva alerta de administración:",
  "admin_alert.action": "Ver alerta",

  "buy_order_filled.subject": "Tu orden de compra se ha completado",
  "buy_order_filled.body":
    "{seller} completó tu orden de compra: {quantity} × {item} por {total} aUEC. Se ha creado un pedido.",
  "buy_order_filled.open": "Aún buscas {remaining} más: tu orden de compra sigue abierta.",
  "buy_order_filled.complete": "Tu orden de compra ya está completa.",
  "buy_order_filled.action": "Ver pedido",

  "listing_paused_by_wipe.subject": "Tus anuncios se han pausado por el wipe",
  "listing_paused_by_wipe.body": "Tus anuncios se han pausado por el wipe. Vuelve a publicarlos con un toque.",
  "listing_paused_by_wipe.tap": "Vuelve a publicarlos con un toque.",
  "listing_paused_by_wipe.action": "Volver a publicar mis anuncios",

  "contract_offer_received.subject": "Nueva oferta en tu contrato",
  "contract_offer_received.preheader": "Alguien hizo una oferta en tu contrato público.",
  "contract_offer_received.heading": "Nueva oferta en tu contrato",
  "contract_offer_received.intro": "Alguien hizo una oferta en tu contrato público:",

  "contractor_invite.subject": "Invitación de contratista",
  "contractor_invite.preheader": "Te han invitado a unirte a {org}.",
  "contractor_invite.heading": "Invitación de contratista",
  "contractor_invite.intro": "Te han invitado a unirte a una organización contratista.",
  "contractor_invite.action": "Ver invitación",

  "counter_offer_create.subject": "Contraoferta recibida",
  "counter_offer_create.preheader": "Has recibido una contraoferta.",
  "counter_offer_create.heading": "Contraoferta recibida",
  "counter_offer_create.intro": "Se ha creado una contraoferta:",

  "dm_reminder.subject.single": "Tienes un mensaje sin leer en SC Market",
  "dm_reminder.subject.multiple_other": "Tienes mensajes sin leer en {count} conversaciones en SC Market",
  "dm_reminder.heading": "Mensajes sin leer",
  "dm_reminder.body.single": "Una conversación en SC Market tiene un mensaje esperando tu respuesta.",
  "dm_reminder.body.multiple_other": "{count} conversaciones en SC Market tienen mensajes esperando tu respuesta.",
  "dm_reminder.nudge": "No dejes esperando a tus socios comerciales: una respuesta rápida mantiene la operación en marcha.",
  "dm_reminder.action": "Ver mensajes",

  "market_item_bid.subject": "Nueva puja en tu anuncio",
  "market_item_bid.preheader": "Alguien pujó por «{title}».",
  "market_item_bid.heading": "Nueva puja en tu anuncio",
  "market_item_bid.intro": "Alguien pujó por tu anuncio del mercado:",
  "market_item_bid.amount": "Importe de la puja:",

  "market_item_offer.subject": "Nueva oferta en tu anuncio",
  "market_item_offer.preheader": "Alguien hizo una oferta por «{title}».",
  "market_item_offer.heading": "Nueva oferta en tu anuncio",
  "market_item_offer.intro": "Alguien hizo una oferta por tu anuncio del mercado:",
  "market_item_offer.amount": "Importe de la oferta:",

  "offer_accepted.subject": "Oferta aceptada",
  "offer_accepted.preheader": "Tu oferta fue aceptada.",
  "offer_accepted.heading": "Oferta aceptada",
  "offer_accepted.intro": "Tu oferta fue aceptada:",

  "offer_create.subject": "Nueva oferta",
  "offer_create.preheader": "Se ha creado una nueva oferta.",
  "offer_create.heading": "Nueva oferta",
  "offer_create.intro": "Se ha creado una nueva oferta:",

  "offer_message.subject": "Nuevo mensaje en una oferta",
  "offer_message.preheader": "{author} envió un mensaje en tu oferta.",
  "offer_message.heading": "Nuevo mensaje en una oferta",
  "offer_message.intro": "Hay un nuevo mensaje en tu oferta:",
  "offer_message.sent": "<b>{author}</b> escribió:",

  "offer_pending_reminder.subject.single": "Una oferta espera tu respuesta",
  "offer_pending_reminder.subject.multiple_other": "{count} ofertas esperan tu respuesta",
  "offer_pending_reminder.body.single":
    "{buyer} lleva {waited} esperando una respuesta a «{title}». Acepta, rechaza, haz una contraoferta o responde en el chat.",
  "offer_pending_reminder.body.multiple_other":
    "{count} compradores esperan una respuesta. Acepta, rechaza, haz una contraoferta o responde en el chat.",
  "offer_pending_reminder.action": "Responder a la oferta",

  "offer_pending_final_reminder.subject.single": "Último recordatorio: una oferta sigue esperando tu respuesta",
  "offer_pending_final_reminder.subject.multiple_other": "Último recordatorio: {count} ofertas siguen esperando tu respuesta",
  "offer_pending_final_reminder.body.single":
    "{buyer} lleva {waited} esperando una respuesta a «{title}». Si sigue sin respuesta, avisaremos al comprador de que sigue en espera.",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} compradores esperan una respuesta. Si siguen sin respuesta, avisaremos a los compradores de que siguen en espera.",
  "offer_pending_final_reminder.action": "Responder a la oferta",

  "offer_waiting_buyer.subject.single": "Tu oferta sigue esperando al vendedor",
  "offer_waiting_buyer.subject.multiple_other": "{count} de tus ofertas siguen esperando al vendedor",
  "offer_waiting_buyer.body.single":
    "{seller} lleva {waited} sin responder a «{title}». Sigue esperando, escribe al vendedor o retira la oferta.",
  "offer_waiting_buyer.body.multiple":
    "Los vendedores llevan unos días sin responder. Sigue esperando, escríbeles o retira tus ofertas.",
  "offer_waiting_buyer.action": "Escribir al vendedor",
  "offer_waiting_buyer.withdraw_prompt": "¿Ya no lo necesitas? <link>Retira la oferta</link>.",
  "offer_waiting_buyer.withdraw": "Retirar la oferta",
  "offer_waiting_buyer.keep_waiting": "Si quieres seguir esperando, no tienes que hacer nada.",

  "offer_rejected.subject": "Oferta rechazada",
  "offer_rejected.preheader": "Tu oferta fue rechazada.",
  "offer_rejected.heading": "Oferta rechazada",
  "offer_rejected.intro": "Tu oferta fue rechazada:",

  "order_assigned.subject": "Pedido asignado",
  "order_assigned.preheader": "Se te ha asignado el pedido «{title}».",
  "order_assigned.heading": "Se te ha asignado un pedido",
  "order_assigned.intro": "Se te ha asignado un nuevo pedido:",
  "order_assigned.outro": "Revisa los detalles del pedido y empieza cuando puedas.",

  "order_create.subject": "Nuevo pedido",
  "order_create.preheader": "Se ha creado el nuevo pedido «{title}».",
  "order_create.heading": "Nuevo pedido",
  "order_create.intro": "Se ha creado un nuevo pedido:",

  "order_message.subject": "Nuevo mensaje en un pedido",
  "order_message.preheader": "{author} envió un mensaje en el pedido «{title}».",
  "order_message.heading": "Nuevo mensaje en un pedido",
  "order_message.intro": "<b>{author}</b> envió un mensaje en el pedido «{title}»:",
  "order_message.action": "Ver el pedido y responder",

  "order_review.subject": "Nueva reseña de un pedido",
  "order_review.preheader": "{author} dejó una reseña de tu pedido.",
  "order_review.heading": "Nueva reseña",
  "order_review.intro": "Se ha publicado una nueva reseña de tu pedido:",
  "order_review.by": "De:",

  "order_review_revision_requested.subject": "Revisión de reseña solicitada",
  "order_review_revision_requested.preheader": "Se ha solicitado una revisión de tu reseña del pedido «{title}».",
  "order_review_revision_requested.heading": "Revisión de reseña solicitada",
  "order_review_revision_requested.intro": "Se ha solicitado una revisión de tu reseña del pedido «{title}»:",
  "order_review_revision_requested.your_review": "Tu reseña:",
  "order_review_revision_requested.request": "Revisión solicitada:",

  "order_status_cancelled.subject": "Pedido cancelado",
  "order_status_cancelled.heading": "Pedido cancelado",
  "order_status_cancelled.intro": "El pedido «{title}» se ha cancelado.",
  "order_status_fulfilled.subject": "Pedido completado",
  "order_status_fulfilled.heading": "Pedido completado",
  "order_status_fulfilled.intro": "El pedido «{title}» se ha completado.",
  "order_status_in_progress.subject": "Pedido en curso",
  "order_status_in_progress.heading": "Pedido en curso",
  "order_status_in_progress.intro": "El pedido «{title}» ya está en curso.",
  "order_status_not_started.subject": "Estado del pedido actualizado",
  "order_status_not_started.heading": "Pedido en cola",
  "order_status_not_started.intro": "El estado del pedido «{title}» ha cambiado a En cola.",

  "price_alert.subject": "Alerta de precio: {title} a {price} aUEC",
  "price_alert.preheader": "{title} se anuncia a {price} aUEC, igual o por debajo de tu precio objetivo de {target} aUEC.",
  "price_alert.heading": "Alerta de precio",
  "price_alert.intro": "Un anuncio de tu lista de seguimiento alcanzó tu precio objetivo:",
  "price_alert.price": "Precio:",
  "price_alert.target": "Tu precio objetivo:",
  "price_alert.quantity": "Cantidad:",
  "price_alert.seller": "Vendedor:",

  "staff_storefront_enquiry.subject": "Nueva solicitud de escaparate: {name}",
  "staff_storefront_enquiry.preheader": "{requester} pidió {subdomain}",
  "staff_storefront_enquiry.heading": "Nueva solicitud de escaparate",
  "staff_storefront_enquiry.intro": "{requester} pidió al equipo de SC Market un escaparate con su marca.",
  "staff_storefront_enquiry.target_org": "Org:",
  "staff_storefront_enquiry.target_shop": "Tienda:",
  "staff_storefront_enquiry.requested_by": "Solicitado por:",
  "staff_storefront_enquiry.contact": "Contacto:",
  "staff_storefront_enquiry.contact_discord": "Discord",
  "staff_storefront_enquiry.contact_message": "Mensaje en SC Market",
  "staff_storefront_enquiry.action": "Abrir en Administración",

  "storefront_enquiry_accepted.subject": "Solicitud de escaparate aceptada",
  "storefront_enquiry_accepted.preheader":
    "El equipo de SC Market aceptó tu solicitud de escaparate con tu marca para {name} ({subdomain}).",
  "storefront_enquiry_accepted.heading": "Solicitud de escaparate aceptada",
  "storefront_enquiry_accepted.intro": "El equipo de SC Market aceptó tu solicitud de escaparate con tu marca:",
  "storefront_enquiry_accepted.action": "Abrir la configuración del escaparate",
  "storefront_enquiry_declined.subject": "Solicitud de escaparate rechazada",
  "storefront_enquiry_declined.preheader":
    "El equipo de SC Market rechazó tu solicitud de escaparate con tu marca para {name} ({subdomain}).",
  "storefront_enquiry_declined.heading": "Solicitud de escaparate rechazada",
  "storefront_enquiry_declined.intro": "El equipo de SC Market rechazó tu solicitud de escaparate con tu marca:",
  "storefront_enquiry_declined.retry": "Puedes enviar una nueva solicitud desde la configuración de tu escaparate.",
  "storefront_enquiry_declined.action": "Abrir la configuración del escaparate",

  "verification.subject": "Verifica tu dirección de correo – SC Market",
  "verification.preheader": "Confirma esta dirección para recibir los correos de SC Market.",
  "verification.heading": "Verifica tu dirección de correo",
  "verification.intro":
    "Gracias por añadir tu dirección de correo a tu cuenta de SC Market. Verifícala con el botón de abajo:",
  "verification.intro_text":
    "Gracias por añadir tu dirección de correo a tu cuenta de SC Market. Verifícala con el enlace de abajo:",
  "verification.action": "Verificar dirección de correo",
  "verification.copy_link": "O copia y pega este enlace en tu navegador:",
  "verification.expires": "Este enlace de verificación caduca en 24 horas.",
  "verification.ignore": "Si no has pedido este correo, puedes ignorarlo.",
}

export default es
