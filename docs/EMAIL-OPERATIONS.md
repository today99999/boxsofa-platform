# Transactional email operations

## Delivery cadence and safety

Vercel calls the payment-confirmation delivery route every five minutes. The
route accepts only its bearer `CRON_SECRET`; it is not a public send endpoint.
Payment remains successful during an email outage: payment and order records
are committed independently, then transactional delivery is retried from the
outbox.

Transactional delivery uses the configured provider API. No mailbox
credentials are used for transactional delivery; it does not use IMAP or SMTP
inbox access.

## Configuration

Before release, configure these server-side variables in the deployment
environment:

- `EMAIL_PROVIDER=resend`
- `EMAIL_FROM` for a verified sender identity
- `EMAIL_API_KEY` for the transactional provider
- `SUPABASE_SERVICE_ROLE_KEY` for the server-only outbox worker
- `CRON_SECRET`, a unique random value of at least 32 characters, used by the
  Vercel cron bearer authorization

Do not put any of these values in source control, client-side variables, logs,
or support tickets. Verify the sending domain in the selected provider before
enabling live delivery.

## Monitoring and recovery

Owners can inspect queued and failed notifications in the admin notification
view. Use the manual retry action for a failed notification after resolving the
provider or configuration problem. The scheduled worker also retries eligible
queued and failed work on its next five-minute run.

`sent` and `skipped` are terminal states: do not retry or resend them from the
admin interface. A send is idempotent per notification so recovery cannot
intentionally create duplicate provider deliveries.

Treat notification metadata as sensitive operational data. Do not paste full
customer email addresses, message subjects, or message bodies into logs,
tickets, or incident notes. Record only the notification identifier, state,
attempt count, provider category, and a redacted error summary.
