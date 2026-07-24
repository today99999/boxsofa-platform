# Paid Order Thank-You Email Design

## Goal

Automatically send one concise thank-you email after a BoxSofa order is fully paid. The email uses the language selected when the order was placed, addresses the customer by the name stored on the order, and is sent to the email stored on the order. When that payment makes the customer a member by taking confirmed lifetime purchases to at least EUR 300, the same email also thanks the customer for becoming a BoxSofa member.

## Scope

This change covers the `payment_confirmed` transactional email only. It does not change support-mailbox replies, refunds, disputes, shipping notices, marketing consent, or the existing owner controls for requeuing, skipping, and manually retrying notifications.

Supported languages are Chinese, English, Spanish, French, and German (`zh`, `en`, `es`, `fr`, `de`).

## Data Model

Add a required `locale` column to `orders`, constrained to the five supported language codes and defaulting to `en` for migration safety. New orders must store the website language selected at checkout. This is an immutable communication snapshot: later changes to a profile's `preferred_locale` do not alter an existing order's language.

Existing orders are backfilled from the linked profile's `preferred_locale` when available, otherwise `en`.

The customer name and recipient address continue to come from `orders.customer_name` and `orders.customer_email`. The email path must not substitute current profile values because the order is the authoritative transaction snapshot.

Add a `member_welcome` boolean to `email_notifications`, defaulting to `false`. It records whether this specific payment notification represents the customer's first transition into membership, so retries reproduce the same message.

## Payment and Membership Decision

The existing Stripe payment transaction remains the source of truth. Within the idempotent payment-confirmation operation:

1. Lock and validate the order and payment as it does today.
2. Capture whether the linked customer was already a member.
3. Commit the successful payment and update the order to paid.
4. Refresh the customer's cumulative paid total and membership state.
5. Set `member_welcome` only when the customer changed from non-member to member during this payment.
6. Insert one `payment_confirmed` email notification using the existing unique `(order_id, event)` protection.

Guest orders without a linked customer profile can receive the normal paid-order thank-you email, but cannot receive a membership welcome because membership is tied to a customer profile.

Refunds do not generate or retract a past welcome message. Existing membership recalculation rules remain authoritative for current eligibility.

## Localized Content

Each template has localized subject, preview text, greeting, body, membership sentence, and sign-off. The core meaning is:

- Address the customer by the order name.
- Thank them for buying from `boxsofa.eu`.
- State that BoxSofa will ship the order as soon as possible.
- When `member_welcome` is true, thank them for becoming a BoxSofa member and state that future eligible orders receive the existing 10% member discount.

The email includes the order number for traceability. It does not claim that the order has shipped and does not promise a specific dispatch date.

If an unsupported locale somehow reaches the template layer, the system uses English and records the data issue in application logs without exposing customer details.

### Approved Copy

`{customerName}` and `{orderNumber}` are replaced from the immutable order snapshot. The membership paragraph is included only when `member_welcome` is true.

#### Chinese

Subject: `感谢您的购买｜BoxSofa 订单 {orderNumber}`

```text
您好，{customerName}：

感谢您在 boxsofa.eu 购买我们的产品。您的订单 {orderNumber} 已支付成功，我们会尽快为您安排发货。

感谢您成为 BoxSofa 会员！您今后符合条件的订单可享受 10% 会员折扣。

此致
BoxSofa 团队
```

#### English

Subject: `Thank you for your purchase | BoxSofa order {orderNumber}`

```text
Hello {customerName},

Thank you for purchasing from boxsofa.eu. Payment for your order {orderNumber} has been confirmed, and we will arrange shipment as soon as possible.

We would also like to thank you for becoming a BoxSofa member! You can now receive a 10% member discount on eligible future orders.

Kind regards,
The BoxSofa Team
```

#### Spanish

Subject: `Gracias por tu compra | Pedido BoxSofa {orderNumber}`

```text
Hola, {customerName}:

Gracias por comprar en boxsofa.eu. Hemos confirmado el pago de tu pedido {orderNumber} y prepararemos el envío lo antes posible.

¡También queremos darte las gracias por hacerte miembro de BoxSofa! A partir de ahora podrás disfrutar de un 10 % de descuento para miembros en futuros pedidos que cumplan las condiciones.

Un cordial saludo,
El equipo de BoxSofa
```

#### French

Subject: `Merci pour votre achat | Commande BoxSofa {orderNumber}`

```text
Bonjour {customerName},

Merci pour votre achat sur boxsofa.eu. Le paiement de votre commande {orderNumber} a bien été confirmé et nous organiserons son expédition dans les meilleurs délais.

Nous vous remercions également d’être devenu membre de BoxSofa ! Vous pouvez désormais bénéficier d’une remise membre de 10 % sur vos prochaines commandes éligibles.

Cordialement,
L’équipe BoxSofa
```

#### German

Subject: `Vielen Dank für Ihren Einkauf | BoxSofa-Bestellung {orderNumber}`

```text
Hallo {customerName},

vielen Dank für Ihren Einkauf bei boxsofa.eu. Die Zahlung für Ihre Bestellung {orderNumber} wurde bestätigt. Wir werden den Versand so schnell wie möglich veranlassen.

Außerdem bedanken wir uns herzlich dafür, dass Sie BoxSofa-Mitglied geworden sind! Bei zukünftigen berechtigten Bestellungen erhalten Sie nun 10 % Mitgliederrabatt.

Freundliche Grüße
Ihr BoxSofa-Team
```

For non-member notifications, omit the membership paragraph and its preceding blank line while keeping the remainder unchanged.

## Automatic Delivery

Retain the existing transactional-email provider, database notification state machine, delivery lease, and provider idempotency key.

Add a secured automatic dispatcher endpoint and a Vercel cron schedule. On each run, the dispatcher:

1. Selects a small, deterministic batch of queued, failed, or expired notifications that are eligible for delivery.
2. Uses the existing claim RPC so concurrent runs cannot send the same notification.
3. Sends through the existing provider with the notification ID as the idempotency key.
4. Uses the existing finalize RPC to record success or failure.

The payment webhook only queues the email; it does not wait for the email provider. A provider outage therefore cannot invalidate or delay payment confirmation.

Failed deliveries remain visible in the admin notification view and are retried by later cron runs with a bounded retry policy. Sent and skipped notifications remain terminal and are never resent automatically.

The dispatcher accepts only Vercel cron authentication through `CRON_SECRET`; it does not expose a public send operation.

## Error Handling and Observability

- Order creation rejects unsupported locale values.
- Payment replays do not duplicate payments, membership transitions, or email notifications.
- Delivery concurrency is controlled by the existing lease token.
- Provider failures store a safe error summary without credentials or message content.
- The admin readiness view continues to surface queued and failed counts.
- Logs contain notification and order identifiers where useful, but never mailbox credentials, provider API keys, or full customer personal data.

## Testing

Add automated coverage for:

- Order creation persists each supported checkout locale.
- Existing-order migration uses profile locale and falls back to English.
- All five localized templates include the customer's name, order number, thanks, and prompt-shipping statement.
- The membership sentence appears only on the first payment that crosses the EUR 300 cumulative threshold.
- A customer already above the threshold does not receive repeated membership welcomes.
- Guest paid orders receive the standard message without membership text.
- Concurrent Stripe webhook replays create one notification.
- Concurrent dispatcher runs claim and send one notification once.
- Provider failure is finalized safely and can be retried.
- Sent and skipped notifications are not retried.
- The dispatcher rejects missing or invalid cron authentication.

Run unit tests, type checking, migration validation, Stripe financial integration tests, and a production build before deployment.

## Rollout

1. Apply and verify the database migration.
2. Deploy localized templates, queue changes, secured dispatcher, and cron configuration together.
3. Verify the email provider and cron secret are configured.
4. Use a controlled paid test order for each language in a non-production recipient environment.
5. Confirm one notification is sent, the stored locale matches checkout, and membership text appears only on threshold crossing.
6. Monitor queued and failed notification counts after production release.

No email is sent merely by applying this design or its migration; automatic delivery begins only after the application deployment and environment checks succeed.
