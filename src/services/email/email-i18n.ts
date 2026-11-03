/**
 * Translated email copy, in the site's 8 languages (accounts.locale; English
 * otherwise). Used by the emails that are translated so far: the
 * account-identity security notice (account_identity_changed), the
 * unread-message reminder (dm_reminder) and "Your buy order was filled"
 * (buy_order_filled, also its push). The other templates are English.
 *
 * A translated email passes `t` (its own strings) and `layout` (the base
 * layout's footer and one-time defaults notice) to its template; the layout
 * falls back to English when `layout` is absent, so every other email renders
 * exactly as before.
 *
 * The wording follows the site's own (the same register and terms as the
 * frontend locales: e.g. the identity bodies are the bell notice's texts).
 */
import { campaignLocale, type CampaignLocale } from "../dm-campaigns/still-selling-message.js"
import type { IdentityActionKind } from "../identity-admin/identity-admin.service.js"

export type EmailLocale = CampaignLocale
export const EMAIL_LOCALES = ["en", "de", "es", "fr", "ja", "uk", "zh-CN", "zh-TW"] as const satisfies readonly EmailLocale[]

/** accounts.locale -> one of the 8 email languages (English otherwise). */
export function emailLocale(raw: string | null | undefined): EmailLocale {
  return campaignLocale(raw)
}

export interface LayoutStrings {
  unsubscribe: string
  managePreferences: string
  defaultsNotice: string
  turnOff: string
}

const LAYOUT: Record<EmailLocale, LayoutStrings> = {
  en: {
    unsubscribe: "Unsubscribe",
    managePreferences: "Manage Preferences",
    defaultsNotice: "We turned on email for order updates, offers and unread messages. Turn off with one click:",
    turnOff: "Turn these emails off",
  },
  de: {
    unsubscribe: "Abmelden",
    managePreferences: "Einstellungen verwalten",
    defaultsNotice:
      "Wir haben E-Mails für Bestellupdates, Angebote und ungelesene Nachrichten eingeschaltet. Mit einem Klick ausschalten:",
    turnOff: "Diese E-Mails ausschalten",
  },
  es: {
    unsubscribe: "Cancelar suscripción",
    managePreferences: "Gestionar preferencias",
    defaultsNotice: "Activamos el correo para novedades de pedidos, ofertas y mensajes sin leer. Desactívalo con un clic:",
    turnOff: "Desactivar estos correos",
  },
  fr: {
    unsubscribe: "Se désabonner",
    managePreferences: "Gérer les préférences",
    defaultsNotice:
      "Nous avons activé les e-mails pour les mises à jour de commandes, les offres et les messages non lus. Désactive-les en un clic :",
    turnOff: "Désactiver ces e-mails",
  },
  ja: {
    unsubscribe: "配信停止",
    managePreferences: "通知設定を管理",
    defaultsNotice: "注文の更新、オファー、未読メッセージのメール通知をオンにしました。ワンクリックでオフにできます：",
    turnOff: "これらのメールをオフにする",
  },
  uk: {
    unsubscribe: "Відписатися",
    managePreferences: "Керувати налаштуваннями",
    defaultsNotice:
      "Ми ввімкнули листи про оновлення замовлень, пропозиції та непрочитані повідомлення. Вимкніть одним кліком:",
    turnOff: "Вимкнути ці листи",
  },
  "zh-CN": {
    unsubscribe: "退订",
    managePreferences: "管理偏好设置",
    defaultsNotice: "我们为订单更新、报价和未读消息开启了邮件通知。一键关闭：",
    turnOff: "关闭这些邮件",
  },
  "zh-TW": {
    unsubscribe: "取消訂閱",
    managePreferences: "管理偏好設定",
    defaultsNotice: "我們為訂單更新、報價和未讀訊息開啟了電子郵件通知。一鍵關閉：",
    turnOff: "關閉這些郵件",
  },
}

export function layoutStrings(locale: EmailLocale): LayoutStrings {
  return LAYOUT[locale]
}

const GREETING: Record<EmailLocale, (name: string) => string> = {
  en: (n) => `Hello ${n},`,
  de: (n) => `Hallo ${n},`,
  es: (n) => `Hola, ${n}:`,
  fr: (n) => `Bonjour ${n},`,
  ja: (n) => `${n} さん`,
  uk: (n) => `Вітаємо, ${n}!`,
  "zh-CN": (n) => `${n}，你好：`,
  "zh-TW": (n) => `${n}，你好：`,
}

export function greeting(locale: EmailLocale, name: string): string {
  return GREETING[locale](name)
}

// ---------------------------------------------------------------------------
// account_identity_changed: an admin changed your account's identity
// (services/identity-admin). A security email (mandatory, catalog
// emailMandatory): sent whatever the email preferences, no unsubscribe link.
// ---------------------------------------------------------------------------

export type IdentityKind = IdentityActionKind

interface IdentityStrings {
  title: Record<IdentityKind, string>
  /** The bell notice's text (frontend notifications.account_identity.*). */
  body: Record<IdentityKind, (username: string) => string>
  securityNote: string
  action: string
}

const IDENTITY: Record<EmailLocale, IdentityStrings> = {
  en: {
    title: {
      username_released: "Your SC Market username was changed",
      discord_unlinked: "Discord was unlinked from your SC Market account",
      spectrum_cleared: "Your RSI account link was removed",
      spectrum_set: "Your RSI account link was updated",
      account_deactivated: "Your SC Market account was deactivated",
      discord_link_skipped: "Your Discord wasn't linked to SC Market",
      account_reactivated: "Your SC Market account was reactivated",
    },
    body: {
      username_released: (u) =>
        `An admin released your username. Your username is now ${u}. Use Sync handle in Settings to get your current RSI handle back.`,
      discord_unlinked: () =>
        "An admin unlinked Discord from your account. You can link a Discord account again in Settings.",
      spectrum_cleared: () => "An admin removed the RSI link from your account. Verify your RSI account again in Settings.",
      spectrum_set: () => "An admin updated the RSI link on your account.",
      account_deactivated: () => "An admin deactivated your account.",
      discord_link_skipped: () =>
        "Your Discord account is already linked to another SC Market account, so it wasn't linked to this one. If both accounts are yours, contact SC Market support.",
      account_reactivated: () => "An admin reactivated your account.",
    },
    securityNote:
      "This is a security notice about your SC Market account, so it is sent even if you turned email notifications off. If you didn't expect it, contact SC Market support.",
    action: "Open Settings",
  },
  de: {
    title: {
      username_released: "Dein SC-Market-Benutzername wurde geändert",
      discord_unlinked: "Discord wurde von deinem SC-Market-Konto getrennt",
      spectrum_cleared: "Die RSI-Verknüpfung deines Kontos wurde entfernt",
      spectrum_set: "Die RSI-Verknüpfung deines Kontos wurde aktualisiert",
      account_deactivated: "Dein SC-Market-Konto wurde deaktiviert",
      discord_link_skipped: "Dein Discord-Konto wurde nicht mit SC Market verknüpft",
      account_reactivated: "Dein SC-Market-Konto wurde reaktiviert",
    },
    body: {
      username_released: (u) =>
        `Ein Admin hat deinen Benutzernamen freigegeben. Dein Benutzername ist jetzt ${u}. Nutze „Handle synchronisieren“ in den Einstellungen, um deinen aktuellen RSI-Handle zurückzubekommen.`,
      discord_unlinked: () =>
        "Ein Admin hat Discord von deinem Konto getrennt. Du kannst in den Einstellungen wieder ein Discord-Konto verknüpfen.",
      spectrum_cleared: () =>
        "Ein Admin hat die RSI-Verknüpfung von deinem Konto entfernt. Verifiziere dein RSI-Konto in den Einstellungen erneut.",
      spectrum_set: () => "Ein Admin hat die RSI-Verknüpfung deines Kontos aktualisiert.",
      account_deactivated: () => "Ein Admin hat dein Konto deaktiviert.",
      discord_link_skipped: () =>
        "Dein Discord-Konto ist bereits mit einem anderen SC-Market-Konto verknüpft und wurde deshalb nicht mit diesem verknüpft. Wenn beide Konten dir gehören, wende dich an den SC-Market-Support.",
      account_reactivated: () => "Ein Admin hat dein Konto reaktiviert.",
    },
    securityNote:
      "Dies ist ein Sicherheitshinweis zu deinem SC-Market-Konto. Er wird deshalb auch gesendet, wenn du E-Mail-Benachrichtigungen ausgeschaltet hast. Wenn du ihn nicht erwartet hast, wende dich an den SC-Market-Support.",
    action: "Einstellungen öffnen",
  },
  es: {
    title: {
      username_released: "Se cambió tu nombre de usuario de SC Market",
      discord_unlinked: "Se desvinculó Discord de tu cuenta de SC Market",
      spectrum_cleared: "Se quitó el vínculo de RSI de tu cuenta",
      spectrum_set: "Se actualizó el vínculo de RSI de tu cuenta",
      account_deactivated: "Se desactivó tu cuenta de SC Market",
      discord_link_skipped: "Tu Discord no se vinculó a SC Market",
      account_reactivated: "Se reactivó tu cuenta de SC Market",
    },
    body: {
      username_released: (u) =>
        `Un admin liberó tu nombre de usuario. Ahora tu nombre de usuario es ${u}. Usa «Sincronizar handle» en Ajustes para recuperar tu handle actual de RSI.`,
      discord_unlinked: () =>
        "Un admin desvinculó Discord de tu cuenta. Puedes vincular de nuevo una cuenta de Discord en Ajustes.",
      spectrum_cleared: () => "Un admin quitó el vínculo de RSI de tu cuenta. Vuelve a verificar tu cuenta de RSI en Ajustes.",
      spectrum_set: () => "Un admin actualizó el vínculo de RSI de tu cuenta.",
      account_deactivated: () => "Un admin desactivó tu cuenta.",
      discord_link_skipped: () =>
        "Tu cuenta de Discord ya está vinculada a otra cuenta de SC Market, así que no se vinculó a esta. Si ambas cuentas son tuyas, contacta con el soporte de SC Market.",
      account_reactivated: () => "Un admin reactivó tu cuenta.",
    },
    securityNote:
      "Este es un aviso de seguridad sobre tu cuenta de SC Market, por eso se envía aunque hayas desactivado las notificaciones por correo. Si no lo esperabas, contacta con el soporte de SC Market.",
    action: "Abrir Ajustes",
  },
  fr: {
    title: {
      username_released: "Ton nom d'utilisateur SC Market a été modifié",
      discord_unlinked: "Discord a été dissocié de ton compte SC Market",
      spectrum_cleared: "Le lien RSI de ton compte a été retiré",
      spectrum_set: "Le lien RSI de ton compte a été mis à jour",
      account_deactivated: "Ton compte SC Market a été désactivé",
      discord_link_skipped: "Ton Discord n'a pas été associé à SC Market",
      account_reactivated: "Ton compte SC Market a été réactivé",
    },
    body: {
      username_released: (u) =>
        `Un admin a libéré ton nom d'utilisateur. Ton nom d'utilisateur est maintenant ${u}. Utilise « Synchroniser le pseudo » dans les paramètres pour récupérer ton pseudo RSI actuel.`,
      discord_unlinked: () =>
        "Un admin a dissocié Discord de ton compte. Tu peux associer de nouveau un compte Discord dans les paramètres.",
      spectrum_cleared: () =>
        "Un admin a retiré le lien RSI de ton compte. Vérifie de nouveau ton compte RSI dans les paramètres.",
      spectrum_set: () => "Un admin a mis à jour le lien RSI de ton compte.",
      account_deactivated: () => "Un admin a désactivé ton compte.",
      discord_link_skipped: () =>
        "Ton compte Discord est déjà associé à un autre compte SC Market, il n'a donc pas été associé à celui-ci. Si les deux comptes sont à toi, contacte le support SC Market.",
      account_reactivated: () => "Un admin a réactivé ton compte.",
    },
    securityNote:
      "Ceci est un avis de sécurité concernant ton compte SC Market : il est envoyé même si tu as désactivé les notifications par e-mail. Si tu ne t'y attendais pas, contacte le support SC Market.",
    action: "Ouvrir les paramètres",
  },
  ja: {
    title: {
      username_released: "SC Market のユーザー名が変更されました",
      discord_unlinked: "SC Market アカウントから Discord の連携が解除されました",
      spectrum_cleared: "アカウントの RSI 連携が外されました",
      spectrum_set: "アカウントの RSI 連携が更新されました",
      account_deactivated: "SC Market アカウントが無効化されました",
      discord_link_skipped: "Discord が SC Market に連携されませんでした",
      account_reactivated: "SC Market アカウントが再有効化されました",
    },
    body: {
      username_released: (u) =>
        `管理者があなたのユーザー名を解放しました。現在のユーザー名は ${u} です。設定の「ハンドルを同期」で現在の RSI ハンドルを取り戻せます。`,
      discord_unlinked: () =>
        "管理者があなたのアカウントから Discord の連携を解除しました。設定で再び Discord アカウントを連携できます。",
      spectrum_cleared: () =>
        "管理者があなたのアカウントから RSI の連携を外しました。設定で RSI アカウントを再認証してください。",
      spectrum_set: () => "管理者があなたのアカウントの RSI 連携を更新しました。",
      account_deactivated: () => "管理者があなたのアカウントを無効化しました。",
      discord_link_skipped: () =>
        "あなたの Discord アカウントは別の SC Market アカウントに連携済みのため、このアカウントには連携されませんでした。両方のアカウントがあなたのものなら、SC Market サポートに連絡してください。",
      account_reactivated: () => "管理者があなたのアカウントを再有効化しました。",
    },
    securityNote:
      "これは SC Market アカウントに関するセキュリティのお知らせのため、メール通知をオフにしていても送信されます。心当たりがない場合は、SC Market サポートに連絡してください。",
    action: "設定を開く",
  },
  uk: {
    title: {
      username_released: "Ваше ім'я користувача SC Market змінено",
      discord_unlinked: "Discord від'єднано від вашого облікового запису SC Market",
      spectrum_cleared: "Зв'язок із RSI видалено з вашого облікового запису",
      spectrum_set: "Зв'язок із RSI у вашому обліковому записі оновлено",
      account_deactivated: "Ваш обліковий запис SC Market деактивовано",
      discord_link_skipped: "Ваш Discord не прив'язано до SC Market",
      account_reactivated: "Ваш обліковий запис SC Market знову активовано",
    },
    body: {
      username_released: (u) =>
        `Адміністратор звільнив ваше ім'я користувача. Тепер ваше ім'я користувача — ${u}. Скористайтеся «Синхронізувати хендл» у налаштуваннях, щоб повернути свій поточний хендл RSI.`,
      discord_unlinked: () =>
        "Адміністратор від'єднав Discord від вашого облікового запису. Ви можете знову прив'язати обліковий запис Discord у налаштуваннях.",
      spectrum_cleared: () =>
        "Адміністратор видалив зв'язок із RSI з вашого облікового запису. Підтвердьте свій обліковий запис RSI знову в налаштуваннях.",
      spectrum_set: () => "Адміністратор оновив зв'язок із RSI у вашому обліковому записі.",
      account_deactivated: () => "Адміністратор деактивував ваш обліковий запис.",
      discord_link_skipped: () =>
        "Ваш обліковий запис Discord уже прив'язано до іншого облікового запису SC Market, тому його не прив'язано до цього. Якщо обидва облікові записи ваші, зверніться до підтримки SC Market.",
      account_reactivated: () => "Адміністратор знову активував ваш обліковий запис.",
    },
    securityNote:
      "Це сповіщення безпеки щодо вашого облікового запису SC Market, тому його надсилають, навіть якщо ви вимкнули сповіщення електронною поштою. Якщо ви на нього не очікували, зверніться до підтримки SC Market.",
    action: "Відкрити налаштування",
  },
  "zh-CN": {
    title: {
      username_released: "你的 SC Market 用户名已更改",
      discord_unlinked: "你的 SC Market 账户已解除 Discord 关联",
      spectrum_cleared: "你账户的 RSI 关联已移除",
      spectrum_set: "你账户的 RSI 关联已更新",
      account_deactivated: "你的 SC Market 账户已停用",
      discord_link_skipped: "你的 Discord 未关联到 SC Market",
      account_reactivated: "你的 SC Market 账户已重新启用",
    },
    body: {
      username_released: (u) =>
        `管理员释放了你的用户名。你现在的用户名是 ${u}。在设置中使用“同步名称”可取回你当前的 RSI 名称。`,
      discord_unlinked: () => "管理员解除了你账户的 Discord 关联。你可以在设置中重新关联 Discord 账户。",
      spectrum_cleared: () => "管理员移除了你账户的 RSI 关联。请在设置中重新验证你的 RSI 账户。",
      spectrum_set: () => "管理员更新了你账户的 RSI 关联。",
      account_deactivated: () => "管理员停用了你的账户。",
      discord_link_skipped: () =>
        "你的 Discord 账户已关联到另一个 SC Market 账户，因此没有关联到此账户。如果两个账户都是你的，请联系 SC Market 支持。",
      account_reactivated: () => "管理员重新启用了你的账户。",
    },
    securityNote:
      "这是关于你的 SC Market 账户的安全通知，因此即使你关闭了邮件通知也会发送。如果这不在你的预期之内，请联系 SC Market 支持。",
    action: "打开设置",
  },
  "zh-TW": {
    title: {
      username_released: "你的 SC Market 使用者名稱已變更",
      discord_unlinked: "你的 SC Market 帳號已解除 Discord 連結",
      spectrum_cleared: "你帳號的 RSI 連結已移除",
      spectrum_set: "你帳號的 RSI 連結已更新",
      account_deactivated: "你的 SC Market 帳號已停用",
      discord_link_skipped: "你的 Discord 未連結到 SC Market",
      account_reactivated: "你的 SC Market 帳號已重新啟用",
    },
    body: {
      username_released: (u) =>
        `管理員釋出了你的使用者名稱。你現在的使用者名稱是 ${u}。在設定中使用「同步名稱」可取回你目前的 RSI 名稱。`,
      discord_unlinked: () => "管理員解除了你帳號的 Discord 連結。你可以在設定中重新連結 Discord 帳號。",
      spectrum_cleared: () => "管理員移除了你帳號的 RSI 連結。請在設定中重新驗證你的 RSI 帳號。",
      spectrum_set: () => "管理員更新了你帳號的 RSI 連結。",
      account_deactivated: () => "管理員停用了你的帳號。",
      discord_link_skipped: () =>
        "你的 Discord 帳號已連結到另一個 SC Market 帳號，因此沒有連結到此帳號。如果兩個帳號都是你的，請聯絡 SC Market 支援。",
      account_reactivated: () => "管理員重新啟用了你的帳號。",
    },
    securityNote:
      "這是關於你的 SC Market 帳號的安全通知，因此即使你關閉了電子郵件通知也會寄送。如果這不在你的預期之內，請聯絡 SC Market 支援。",
    action: "開啟設定",
  },
}

export interface IdentityEmailText {
  title: string
  body: string
  securityNote: string
  /** Absent when there is nothing to do on the site (a deactivated account can't log in). */
  action?: string
}

export function identityEmailText(
  locale: EmailLocale,
  kind: IdentityKind,
  notice: { new_username?: string },
): IdentityEmailText {
  const s = IDENTITY[locale]
  return {
    title: s.title[kind],
    body: s.body[kind](notice.new_username ?? ""),
    securityNote: s.securityNote,
    ...(kind === "account_deactivated" ? {} : { action: s.action }),
  }
}

// ---------------------------------------------------------------------------
// dm_reminder: messages in your order / offer chats unread for ~6 hours
// (services/dm-reminders). Opt-in, unsubscribable.
// ---------------------------------------------------------------------------

/** Ukrainian plural category: one (1, 21, ...), few (2-4, 22-24, ...), many. */
function ukOne(n: number): boolean {
  return n % 10 === 1 && n % 100 !== 11
}

interface ReminderStrings {
  heading: string
  subject: (n: number) => string
  body: (n: number) => string
  nudge: string
  action: string
}

const REMINDER: Record<EmailLocale, ReminderStrings> = {
  en: {
    heading: "Unread messages",
    subject: (n) =>
      n === 1 ? "You have an unread message on SC Market" : `You have unread messages in ${n} conversations on SC Market`,
    body: (n) =>
      n === 1
        ? "A conversation on SC Market has a message waiting for your reply."
        : `${n} conversations on SC Market have messages waiting for your reply.`,
    nudge: "Don't leave your trading partners hanging: a quick reply keeps the trade moving.",
    action: "View messages",
  },
  de: {
    heading: "Ungelesene Nachrichten",
    subject: (n) =>
      n === 1
        ? "Du hast eine ungelesene Nachricht auf SC Market"
        : `Du hast ungelesene Nachrichten in ${n} Unterhaltungen auf SC Market`,
    body: (n) =>
      n === 1
        ? "In einer Unterhaltung auf SC Market wartet eine Nachricht auf deine Antwort."
        : `In ${n} Unterhaltungen auf SC Market warten Nachrichten auf deine Antwort.`,
    nudge: "Lass deine Handelspartner nicht warten: Eine kurze Antwort hält den Handel in Gang.",
    action: "Nachrichten ansehen",
  },
  es: {
    heading: "Mensajes sin leer",
    subject: (n) =>
      n === 1 ? "Tienes un mensaje sin leer en SC Market" : `Tienes mensajes sin leer en ${n} conversaciones en SC Market`,
    body: (n) =>
      n === 1
        ? "Una conversación en SC Market tiene un mensaje esperando tu respuesta."
        : `${n} conversaciones en SC Market tienen mensajes esperando tu respuesta.`,
    nudge: "No dejes esperando a tus socios comerciales: una respuesta rápida mantiene el trato en marcha.",
    action: "Ver mensajes",
  },
  fr: {
    heading: "Messages non lus",
    subject: (n) =>
      n === 1 ? "Tu as un message non lu sur SC Market" : `Tu as des messages non lus dans ${n} conversations sur SC Market`,
    body: (n) =>
      n === 1
        ? "Une conversation sur SC Market a un message qui attend ta réponse."
        : `${n} conversations sur SC Market ont des messages qui attendent ta réponse.`,
    nudge: "Ne laisse pas tes partenaires commerciaux attendre : une réponse rapide fait avancer l'échange.",
    action: "Voir les messages",
  },
  ja: {
    heading: "未読メッセージ",
    subject: (n) =>
      n === 1 ? "SC Market に未読メッセージがあります" : `SC Market の ${n} 件の会話に未読メッセージがあります`,
    body: (n) =>
      n === 1
        ? "SC Market の会話で、あなたの返信を待っているメッセージがあります。"
        : `SC Market の ${n} 件の会話で、あなたの返信を待っているメッセージがあります。`,
    nudge: "取引相手を待たせないようにしましょう。すばやく返信すると取引がスムーズに進みます。",
    action: "メッセージを見る",
  },
  uk: {
    heading: "Непрочитані повідомлення",
    subject: (n) =>
      n === 1
        ? "У вас є непрочитане повідомлення на SC Market"
        : `У вас є непрочитані повідомлення в ${n} ${ukOne(n) ? "розмові" : "розмовах"} на SC Market`,
    body: (n) =>
      n === 1
        ? "У розмові на SC Market на вашу відповідь чекає повідомлення."
        : `У ${n} ${ukOne(n) ? "розмові" : "розмовах"} на SC Market на вашу відповідь чекають повідомлення.`,
    nudge: "Не змушуйте торгових партнерів чекати: швидка відповідь допомагає угоді рухатися далі.",
    action: "Переглянути повідомлення",
  },
  "zh-CN": {
    heading: "未读消息",
    subject: (n) => (n === 1 ? "你在 SC Market 有一条未读消息" : `你在 SC Market 的 ${n} 个对话中有未读消息`),
    body: (n) =>
      n === 1 ? "SC Market 上有一个对话的消息正在等待你回复。" : `SC Market 上有 ${n} 个对话的消息正在等待你回复。`,
    nudge: "别让交易伙伴久等：及时回复能让交易顺利进行。",
    action: "查看消息",
  },
  "zh-TW": {
    heading: "未讀訊息",
    subject: (n) => (n === 1 ? "你在 SC Market 有一則未讀訊息" : `你在 SC Market 的 ${n} 個對話中有未讀訊息`),
    body: (n) =>
      n === 1 ? "SC Market 上有一個對話的訊息正在等待你回覆。" : `SC Market 上有 ${n} 個對話的訊息正在等待你回覆。`,
    nudge: "別讓交易夥伴久等：及時回覆能讓交易順利進行。",
    action: "查看訊息",
  },
}

export interface ReminderEmailText {
  heading: string
  subject: string
  body: string
  nudge: string
  action: string
}

export function reminderEmailText(locale: EmailLocale, conversations: number): ReminderEmailText {
  const s = REMINDER[locale]
  return {
    heading: s.heading,
    subject: s.subject(conversations),
    body: s.body(conversations),
    nudge: s.nudge,
    action: s.action,
  }
}

// ---------------------------------------------------------------------------
// buy_order_filled: a seller filled one of your buy orders and an order now
// exists (services/notifications/buy-order-filled.ts). The push and the
// email say the same thing. Amounts are formatted by the caller.
// ---------------------------------------------------------------------------

export interface BuyOrderFilledFacts {
  /** The selling shop's name. */
  seller: string
  item: string
  quantity: number
  /** Order total, already formatted (e.g. "12,000"). */
  total: string
  /** Units the buy order still wants after this fill (0 = complete). */
  remaining: number
}

interface BuyOrderFilledStrings {
  title: string
  body: (f: BuyOrderFilledFacts) => string
  open: (remaining: number) => string
  complete: string
  action: string
}

const BUY_ORDER_FILLED: Record<EmailLocale, BuyOrderFilledStrings> = {
  en: {
    title: "Your buy order was filled",
    body: (f) => `${f.seller} filled your buy order: ${f.quantity} × ${f.item} for ${f.total} aUEC. An order has been created for it.`,
    open: (n) => `${n} more still wanted: your buy order stays open.`,
    complete: "Your buy order is now complete.",
    action: "View order",
  },
  de: {
    title: "Dein Kaufauftrag wurde erfüllt",
    body: (f) =>
      `${f.seller} hat deinen Kaufauftrag erfüllt: ${f.quantity} × ${f.item} für ${f.total} aUEC. Dafür wurde eine Bestellung erstellt.`,
    open: (n) => `Noch ${n} gesucht: Dein Kaufauftrag bleibt offen.`,
    complete: "Dein Kaufauftrag ist jetzt vollständig erfüllt.",
    action: "Bestellung ansehen",
  },
  es: {
    title: "Tu orden de compra se ha completado",
    body: (f) =>
      `${f.seller} completó tu orden de compra: ${f.quantity} × ${f.item} por ${f.total} aUEC. Se ha creado un pedido.`,
    open: (n) => `Aún buscas ${n} más: tu orden de compra sigue abierta.`,
    complete: "Tu orden de compra ya está completa.",
    action: "Ver pedido",
  },
  fr: {
    title: "Ton ordre d'achat a été rempli",
    body: (f) =>
      `${f.seller} a rempli ton ordre d'achat : ${f.quantity} × ${f.item} pour ${f.total} aUEC. Une commande a été créée.`,
    open: (n) => `Il en manque encore ${n} : ton ordre d'achat reste ouvert.`,
    complete: "Ton ordre d'achat est maintenant complet.",
    action: "Voir la commande",
  },
  ja: {
    title: "買い注文が成立しました",
    body: (f) => `${f.seller} があなたの買い注文に応じました：${f.item} × ${f.quantity}（${f.total} aUEC）。注文が作成されました。`,
    open: (n) => `残り ${n} 個を募集中です。買い注文は引き続き有効です。`,
    complete: "買い注文はすべて成立しました。",
    action: "注文を見る",
  },
  uk: {
    title: "Ваше замовлення на купівлю виконано",
    body: (f) =>
      `Продавець ${f.seller} виконав ваше замовлення на купівлю: ${f.quantity} × ${f.item} за ${f.total} aUEC. Для нього створено замовлення.`,
    open: (n) => `Потрібно ще ${n}: ваше замовлення на купівлю залишається відкритим.`,
    complete: "Ваше замовлення на купівлю тепер виконано повністю.",
    action: "Переглянути замовлення",
  },
  "zh-CN": {
    title: "你的求购订单已成交",
    body: (f) => `${f.seller} 响应了你的求购订单：${f.item} × ${f.quantity}，共 ${f.total} aUEC。已为此创建订单。`,
    open: (n) => `还需要 ${n} 个：你的求购订单仍然有效。`,
    complete: "你的求购订单已全部成交。",
    action: "查看订单",
  },
  "zh-TW": {
    title: "你的收購訂單已成交",
    body: (f) => `${f.seller} 回應了你的收購訂單：${f.item} × ${f.quantity}，共 ${f.total} aUEC。已為此建立訂單。`,
    open: (n) => `還需要 ${n} 個：你的收購訂單仍然有效。`,
    complete: "你的收購訂單已全部成交。",
    action: "查看訂單",
  },
}

export interface BuyOrderFilledText {
  title: string
  body: string
  /** Whether the buy order stays open, or is complete. */
  status: string
  action: string
}

export function buyOrderFilledText(locale: EmailLocale, facts: BuyOrderFilledFacts): BuyOrderFilledText {
  const s = BUY_ORDER_FILLED[locale]
  return {
    title: s.title,
    body: s.body(facts),
    status: facts.remaining > 0 ? s.open(facts.remaining) : s.complete,
    action: s.action,
  }
}
