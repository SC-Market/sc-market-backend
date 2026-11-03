/** Japanese email strings (see ../index.ts; keys and placeholders as in en.ts). */
const ja: Record<string, string> = {
  "layout.unsubscribe": "配信停止",
  "layout.manage_preferences": "通知設定を管理",
  "layout.defaults_notice": "注文の更新、オファー、未読メッセージのメール通知をオンにしました。ワンクリックでオフにできます：",
  "layout.turn_off": "これらのメールをオフにする",

  "common.greeting": "{name} さん",
  "common.status": "ステータス：",
  "common.value": "金額：",
  "common.rating": "評価：",
  "common.message": "メッセージ：",
  "common.subdomain": "サブドメイン：",
  "common.offer_number": "オファー #{id}",
  "common.untitled": "無題",
  "common.view_order": "注文を表示",
  "common.view_offer": "オファーを表示",
  "common.view_listing": "出品を表示",
  "common.and_more": "…ほか {count} 件",
  "common.duration_days_other": "{count} 日",
  "common.duration_hours_other": "{count} 時間",

  "status.order.not-started": "未着手",
  "status.order.in-progress": "進行中",
  "status.order.fulfilled": "完了",
  "status.order.cancelled": "キャンセル済み",
  "status.offer.active": "有効",
  "status.offer.closed": "終了",

  "account_identity_changed.subject.username_released": "SC Market のユーザー名が変更されました",
  "account_identity_changed.subject.discord_unlinked": "SC Market アカウントから Discord の連携が解除されました",
  "account_identity_changed.subject.spectrum_cleared": "アカウントの RSI 連携が外されました",
  "account_identity_changed.subject.spectrum_set": "アカウントの RSI 連携が更新されました",
  "account_identity_changed.subject.account_deactivated": "SC Market アカウントが無効化されました",
  "account_identity_changed.subject.discord_link_skipped": "Discord が SC Market に連携されませんでした",
  "account_identity_changed.subject.account_reactivated": "SC Market アカウントが再有効化されました",
  "account_identity_changed.body.username_released":
    "管理者があなたのユーザー名を解放しました。現在のユーザー名は {username} です。設定の「ハンドルを同期」で現在の RSI ハンドルを取り戻せます。",
  "account_identity_changed.body.discord_unlinked":
    "管理者があなたのアカウントから Discord の連携を解除しました。設定で再び Discord アカウントを連携できます。",
  "account_identity_changed.body.spectrum_cleared":
    "管理者があなたのアカウントから RSI の連携を外しました。設定で RSI アカウントを再認証してください。",
  "account_identity_changed.body.spectrum_set": "管理者があなたのアカウントの RSI 連携を更新しました。",
  "account_identity_changed.body.account_deactivated": "管理者があなたのアカウントを無効化しました。",
  "account_identity_changed.body.discord_link_skipped":
    "あなたの Discord アカウントは別の SC Market アカウントに連携済みのため、このアカウントには連携されませんでした。両方のアカウントがあなたのものなら、SC Market サポートに連絡してください。",
  "account_identity_changed.body.account_reactivated": "管理者があなたのアカウントを再有効化しました。",
  "account_identity_changed.security_note":
    "これは SC Market アカウントに関するセキュリティのお知らせのため、メール通知をオフにしていても送信されます。心当たりがない場合は、SC Market サポートに連絡してください。",
  "account_identity_changed.action": "設定を開く",

  "admin_alert.subject": "管理者アラート",
  "admin_alert.preheader": "新しい管理者アラートがあります：{title}",
  "admin_alert.heading": "管理者アラート",
  "admin_alert.intro": "新しい管理者アラートがあります：",
  "admin_alert.action": "アラートを見る",

  "buy_order_filled.subject": "買い注文が成立しました",
  "buy_order_filled.body": "{seller} があなたの買い注文に応じました：{item} × {quantity}（{total} aUEC）。注文が作成されました。",
  "buy_order_filled.open": "残り {remaining} 個を募集中です。買い注文は引き続き有効です。",
  "buy_order_filled.complete": "買い注文はすべて成立しました。",
  "buy_order_filled.action": "注文を見る",

  "contract_offer_received.subject": "あなたの契約に新しいオファーが届きました",
  "contract_offer_received.preheader": "あなたの公開契約にオファーが届きました。",
  "contract_offer_received.heading": "あなたの契約への新しいオファー",
  "contract_offer_received.intro": "あなたの公開契約にオファーが届きました：",

  "contractor_invite.subject": "組織への招待",
  "contractor_invite.preheader": "{org} への参加に招待されました。",
  "contractor_invite.heading": "組織への招待",
  "contractor_invite.intro": "組織への参加に招待されました。",
  "contractor_invite.action": "招待を見る",

  "counter_offer_create.subject": "カウンターオファーが届きました",
  "counter_offer_create.preheader": "カウンターオファーが届きました。",
  "counter_offer_create.heading": "カウンターオファーが届きました",
  "counter_offer_create.intro": "カウンターオファーが作成されました：",

  "dm_reminder.subject.single": "SC Market に未読メッセージがあります",
  "dm_reminder.subject.multiple_other": "SC Market の {count} 件の会話に未読メッセージがあります",
  "dm_reminder.heading": "未読メッセージ",
  "dm_reminder.body.single": "SC Market の会話で、あなたの返信を待っているメッセージがあります。",
  "dm_reminder.body.multiple_other": "SC Market の {count} 件の会話で、あなたの返信を待っているメッセージがあります。",
  "dm_reminder.nudge": "取引相手を待たせないようにしましょう。すばやく返信すると取引がスムーズに進みます。",
  "dm_reminder.action": "メッセージを見る",

  "market_item_bid.subject": "出品に新しい入札がありました",
  "market_item_bid.preheader": "「{title}」に入札がありました。",
  "market_item_bid.heading": "出品への新しい入札",
  "market_item_bid.intro": "あなたの出品に入札がありました：",
  "market_item_bid.amount": "入札額：",

  "market_item_offer.subject": "出品に新しいオファーがありました",
  "market_item_offer.preheader": "「{title}」にオファーがありました。",
  "market_item_offer.heading": "出品への新しいオファー",
  "market_item_offer.intro": "あなたの出品にオファーがありました：",
  "market_item_offer.amount": "オファー額：",

  "offer_accepted.subject": "オファーが承認されました",
  "offer_accepted.preheader": "あなたのオファーが承認されました。",
  "offer_accepted.heading": "オファーが承認されました",
  "offer_accepted.intro": "あなたのオファーが承認されました：",

  "offer_create.subject": "新しいオファー",
  "offer_create.preheader": "新しいオファーが作成されました。",
  "offer_create.heading": "新しいオファー",
  "offer_create.intro": "新しいオファーが作成されました：",

  "offer_message.subject": "オファーに新しいメッセージがあります",
  "offer_message.preheader": "{author} さんがあなたのオファーにメッセージを送りました。",
  "offer_message.heading": "オファーへの新しいメッセージ",
  "offer_message.intro": "あなたのオファーに新しいメッセージが届きました：",
  "offer_message.sent": "<b>{author}</b> さんからのメッセージ：",

  "offer_pending_reminder.subject.single": "オファーがあなたの返信を待っています",
  "offer_pending_reminder.subject.multiple_other": "{count} 件のオファーがあなたの返信を待っています",
  "offer_pending_reminder.body.single":
    "{buyer} さんが「{title}」への返信を {waited} 待っています。承認、拒否、カウンターオファー、またはチャットで返信してください。",
  "offer_pending_reminder.body.multiple_other":
    "{count} 人の購入者が返信を待っています。承認、拒否、カウンターオファー、またはチャットで返信してください。",
  "offer_pending_reminder.action": "オファーに返信する",

  "offer_pending_final_reminder.subject.single": "最後のリマインダー：オファーがまだあなたの返信を待っています",
  "offer_pending_final_reminder.subject.multiple_other": "最後のリマインダー：{count} 件のオファーがまだあなたの返信を待っています",
  "offer_pending_final_reminder.body.single":
    "{buyer} さんが「{title}」への返信を {waited} 待っています。このまま返信がない場合は、購入者にまだ返信待ちであることをお知らせします。",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} 人の購入者が返信を待っています。このまま返信がない場合は、購入者にまだ返信待ちであることをお知らせします。",
  "offer_pending_final_reminder.action": "オファーに返信する",

  "offer_waiting_buyer.subject.single": "あなたのオファーはまだ出品者の返信待ちです",
  "offer_waiting_buyer.subject.multiple_other": "あなたの {count} 件のオファーがまだ出品者の返信待ちです",
  "offer_waiting_buyer.body.single":
    "{seller} から「{title}」への返信が {waited} ありません。このまま待つか、出品者にメッセージを送るか、オファーを取り下げてください。",
  "offer_waiting_buyer.body.multiple":
    "出品者から数日間返信がありません。このまま待つか、メッセージを送るか、オファーを取り下げてください。",
  "offer_waiting_buyer.action": "出品者にメッセージを送る",
  "offer_waiting_buyer.withdraw_prompt": "もう必要ありませんか？<link>オファーを取り下げる</link>",
  "offer_waiting_buyer.withdraw": "オファーを取り下げる",
  "offer_waiting_buyer.keep_waiting": "このまま待つ場合は、何もする必要はありません。",

  "offer_rejected.subject": "オファーが拒否されました",
  "offer_rejected.preheader": "あなたのオファーが拒否されました。",
  "offer_rejected.heading": "オファーが拒否されました",
  "offer_rejected.intro": "あなたのオファーが拒否されました：",

  "order_assigned.subject": "注文が割り当てられました",
  "order_assigned.preheader": "注文「{title}」があなたに割り当てられました。",
  "order_assigned.heading": "あなたに割り当てられた注文",
  "order_assigned.intro": "新しい注文があなたに割り当てられました：",
  "order_assigned.outro": "注文の詳細を確認し、準備ができたら作業を始めてください。",

  "order_create.subject": "新しい注文",
  "order_create.preheader": "新しい注文「{title}」が作成されました。",
  "order_create.heading": "新しい注文",
  "order_create.intro": "新しい注文が作成されました：",

  "order_message.subject": "注文に新しいメッセージがあります",
  "order_message.preheader": "{author} さんが注文「{title}」にメッセージを送りました。",
  "order_message.heading": "注文への新しいメッセージ",
  "order_message.intro": "<b>{author}</b> さんが注文「{title}」にメッセージを送りました：",
  "order_message.action": "注文を表示して返信",

  "order_review.subject": "注文に新しいレビューがあります",
  "order_review.preheader": "{author} さんがあなたの注文にレビューを投稿しました。",
  "order_review.heading": "新しいレビュー",
  "order_review.intro": "あなたの注文に新しいレビューが投稿されました：",
  "order_review.by": "投稿者：",

  "order_review_revision_requested.subject": "レビューの修正依頼",
  "order_review_revision_requested.preheader": "注文「{title}」のあなたのレビューに修正依頼がありました。",
  "order_review_revision_requested.heading": "レビューの修正依頼",
  "order_review_revision_requested.intro": "注文「{title}」のあなたのレビューに修正依頼がありました：",
  "order_review_revision_requested.your_review": "あなたのレビュー：",
  "order_review_revision_requested.request": "修正依頼の内容：",

  "order_status_cancelled.subject": "注文がキャンセルされました",
  "order_status_cancelled.heading": "注文がキャンセルされました",
  "order_status_cancelled.intro": "注文「{title}」がキャンセルされました。",
  "order_status_fulfilled.subject": "注文が完了しました",
  "order_status_fulfilled.heading": "注文が完了しました",
  "order_status_fulfilled.intro": "注文「{title}」が完了しました。",
  "order_status_in_progress.subject": "注文が進行中です",
  "order_status_in_progress.heading": "注文が進行中です",
  "order_status_in_progress.intro": "注文「{title}」が進行中になりました。",
  "order_status_not_started.subject": "注文のステータスが更新されました",
  "order_status_not_started.heading": "注文：未着手",
  "order_status_not_started.intro": "注文「{title}」のステータスが「未着手」に変更されました。",

  "price_alert.subject": "価格アラート：{title} が {price} aUEC",
  "price_alert.preheader": "{title} が {price} aUEC で出品されています。目標価格 {target} aUEC 以下です。",
  "price_alert.heading": "価格アラート",
  "price_alert.intro": "ウォッチリストの出品が目標価格に達しました：",
  "price_alert.price": "価格：",
  "price_alert.target": "目標価格：",
  "price_alert.quantity": "数量：",
  "price_alert.seller": "出品者：",

  "staff_storefront_enquiry.subject": "ストアフロントの新しい問い合わせ：{name}",
  "staff_storefront_enquiry.preheader": "{requester} が {subdomain} をリクエストしました",
  "staff_storefront_enquiry.heading": "ストアフロントの新しい問い合わせ",
  "staff_storefront_enquiry.intro": "{requester} が SC Market スタッフにブランドストアフロントをリクエストしました。",
  "staff_storefront_enquiry.target_org": "組織：",
  "staff_storefront_enquiry.target_shop": "ショップ：",
  "staff_storefront_enquiry.requested_by": "リクエスト者：",
  "staff_storefront_enquiry.contact": "連絡方法：",
  "staff_storefront_enquiry.contact_discord": "Discord",
  "staff_storefront_enquiry.contact_message": "SC Market のメッセージ",
  "staff_storefront_enquiry.action": "管理画面で開く",

  "storefront_enquiry_accepted.subject": "ストアフロントの問い合わせが承認されました",
  "storefront_enquiry_accepted.preheader":
    "SC Market スタッフが {name}（{subdomain}）のブランドストアフロントの問い合わせを承認しました。",
  "storefront_enquiry_accepted.heading": "ストアフロントの問い合わせが承認されました",
  "storefront_enquiry_accepted.intro": "SC Market スタッフがあなたのブランドストアフロントの問い合わせを承認しました：",
  "storefront_enquiry_accepted.action": "ストアフロント設定を開く",
  "storefront_enquiry_declined.subject": "ストアフロントの問い合わせが見送られました",
  "storefront_enquiry_declined.preheader":
    "SC Market スタッフが {name}（{subdomain}）のブランドストアフロントの問い合わせを見送りました。",
  "storefront_enquiry_declined.heading": "ストアフロントの問い合わせが見送られました",
  "storefront_enquiry_declined.intro": "SC Market スタッフがあなたのブランドストアフロントの問い合わせを見送りました：",
  "storefront_enquiry_declined.retry": "ストアフロント設定から新しい問い合わせを送信できます。",
  "storefront_enquiry_declined.action": "ストアフロント設定を開く",

  "verification.subject": "メールアドレスを確認してください - SC Market",
  "verification.preheader": "このアドレスを確認すると、SC Market からのメールを受け取れます。",
  "verification.heading": "メールアドレスの確認",
  "verification.intro":
    "SC Market アカウントにメールアドレスを追加していただきありがとうございます。下のボタンをクリックしてメールアドレスを確認してください：",
  "verification.intro_text":
    "SC Market アカウントにメールアドレスを追加していただきありがとうございます。下のリンクを開いてメールアドレスを確認してください：",
  "verification.action": "メールアドレスを確認",
  "verification.copy_link": "または、このリンクをコピーしてブラウザに貼り付けてください：",
  "verification.expires": "この確認リンクの有効期限は 24 時間です。",
  "verification.ignore": "このメールに心当たりがない場合は、無視してください。",
}

export default ja
