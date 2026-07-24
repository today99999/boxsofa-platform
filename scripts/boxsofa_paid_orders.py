#!/usr/bin/env python3
"""Inspect paid BoxSofa orders and send one localized thank-you email per order."""

from __future__ import annotations

import argparse
import json
import os
import re
import smtplib
import ssl
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable


SUPPORTED_LOCALES = {"zh", "en", "es", "fr", "de"}
ELIGIBLE_ORDER_STATUSES = {"paid_confirmed", "processing", "shipped", "completed"}
MAIL_HOST = "mail.privateemail.com"
SMTP_PORT = 465
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

TEMPLATES = {
    "zh": {
        "subject": "感谢您的订单 {order_number}",
        "hello": "{name}，您好！",
        "thanks": "感谢您在 boxsofa.eu 购买我们的产品。我们会尽快为您发货。",
        "member": "同时感谢您成为 BoxSofa 会员。",
        "closing": "此致\nBoxSofa 团队",
    },
    "en": {
        "subject": "Thank you for your order {order_number}",
        "hello": "Hello {name},",
        "thanks": "Thank you for purchasing our products at boxsofa.eu. We will ship your order as soon as possible.",
        "member": "Thank you as well for becoming a BoxSofa member.",
        "closing": "Kind regards,\nThe BoxSofa Team",
    },
    "es": {
        "subject": "Gracias por tu pedido {order_number}",
        "hello": "Hola {name}:",
        "thanks": "Gracias por comprar nuestros productos en boxsofa.eu. Enviaremos tu pedido lo antes posible.",
        "member": "También te agradecemos que te hayas convertido en miembro de BoxSofa.",
        "closing": "Un cordial saludo,\nEl equipo de BoxSofa",
    },
    "fr": {
        "subject": "Merci pour votre commande {order_number}",
        "hello": "Bonjour {name},",
        "thanks": "Merci d’avoir acheté nos produits sur boxsofa.eu. Nous expédierons votre commande dans les meilleurs délais.",
        "member": "Nous vous remercions également d’être devenu membre de BoxSofa.",
        "closing": "Cordialement,\nL’équipe BoxSofa",
    },
    "de": {
        "subject": "Vielen Dank für Ihre Bestellung {order_number}",
        "hello": "Hallo {name},",
        "thanks": "Vielen Dank für Ihren Einkauf bei boxsofa.eu. Wir versenden Ihre Bestellung so schnell wie möglich.",
        "member": "Vielen Dank auch, dass Sie BoxSofa-Mitglied geworden sind.",
        "closing": "Freundliche Grüße\nIhr BoxSofa-Team",
    },
}


@dataclass(frozen=True)
class Candidate:
    order_number: str
    email: str
    name: str
    locale: str
    member_welcome: bool


class Ledger:
    def __init__(self, path: Path):
        self.path = path
        try:
            loaded = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        except (OSError, json.JSONDecodeError):
            raise RuntimeError("The paid-order success record is unreadable.")
        self.data = loaded if isinstance(loaded, dict) else {}

    def was_sent(self, order_number: str) -> bool:
        return order_number in self.data

    def record_success(self, order_number: str, locale: str, member_welcome: bool) -> None:
        self.data[order_number] = {
            "sent_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "locale": locale,
            "member_welcome": member_welcome,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary_name = tempfile.mkstemp(prefix=self.path.name, suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                json.dump(self.data, stream, ensure_ascii=False, indent=2, sort_keys=True)
                stream.write("\n")
            os.replace(temporary_name, self.path)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)


def amount(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def chronological(rows: Iterable[dict]) -> list[dict]:
    return sorted(rows, key=lambda row: (str(row.get("paid_at") or row.get("created_at") or ""), str(row.get("order_number") or "")))


def member_welcome_for(all_orders: list[dict], target: dict) -> bool:
    customer_id = target.get("customer_id")
    if not customer_id:
        return False
    running = Decimal("0")
    for row in chronological(all_orders):
        if row.get("customer_id") != customer_id or row.get("payment_status") != "paid":
            continue
        if row.get("status") in {"cancelled", "refunded"}:
            continue
        before = running
        running += amount(row.get("total_eur"))
        if row.get("order_number") == target.get("order_number"):
            return before < Decimal("300") <= running
    return False


def valid_customer(row: dict) -> bool:
    return bool(str(row.get("customer_name") or "").strip()) and bool(
        EMAIL_RE.fullmatch(str(row.get("customer_email") or "").strip())
    )


def classify_orders(rows: list[dict], ledger: Ledger, limit: int) -> tuple[list[Candidate], list[str]]:
    eligible: list[Candidate] = []
    manual_review: list[str] = []
    for row in chronological(rows):
        number = str(row.get("order_number") or "").strip()
        if not number or ledger.was_sent(number):
            continue
        payment_status = str(row.get("payment_status") or "")
        status = str(row.get("status") or "")
        if payment_status in {"failed", "refunded", "confirmed_offline"}:
            manual_review.append(number)
            continue
        if payment_status != "paid":
            continue
        if status not in ELIGIBLE_ORDER_STATUSES or not valid_customer(row):
            manual_review.append(number)
            continue
        locale = str(row.get("locale") or "en")
        locale = locale if locale in SUPPORTED_LOCALES else "en"
        eligible.append(
            Candidate(
                order_number=number,
                email=str(row["customer_email"]).strip(),
                name=str(row["customer_name"]).strip(),
                locale=locale,
                member_welcome=member_welcome_for(rows, row),
            )
        )
        if len(eligible) >= limit:
            break
    return eligible, manual_review


def render_email(locale: str, name: str, order_number: str, member_welcome: bool) -> tuple[str, str]:
    template = TEMPLATES.get(locale, TEMPLATES["en"])
    paragraphs = [
        template["hello"].format(name=name),
        template["thanks"],
    ]
    if member_welcome:
        paragraphs.append(template["member"])
    paragraphs.append(template["closing"])
    return template["subject"].format(order_number=order_number), "\n\n".join(paragraphs)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required configuration: {name}.")
    return value


def fetch_orders(project_root: Path) -> list[dict]:
    load_dotenv(project_root / ".env.local")
    base_url = required_environment("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    service_key = required_environment("SUPABASE_SERVICE_ROLE_KEY")
    query = urllib.parse.urlencode(
        {
            "select": "id,order_number,customer_id,customer_email,customer_name,payment_status,status,total_eur,paid_at,created_at,locale",
            "order": "paid_at.asc",
            "limit": "200",
        }
    )
    request = urllib.request.Request(
        f"{base_url}/rest/v1/orders?{query}",
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        raise RuntimeError("Could not read paid orders from the website backend.") from error
    if not isinstance(result, list):
        raise RuntimeError("The website backend returned an invalid order list.")
    return result


def ledger_path() -> Path:
    codex_root = os.environ.get("CODEX_HOME", "").strip()
    base = Path(codex_root) if codex_root else Path.home() / ".codex"
    return base / "automations" / "boxsofa" / "paid-order-thank-you.json"


def send_candidate(candidate: Candidate) -> None:
    address = required_environment("BOXSOFA_MAIL_ADDRESS")
    password = required_environment("BOXSOFA_MAIL_PASSWORD")
    subject, body = render_email(candidate.locale, candidate.name, candidate.order_number, candidate.member_welcome)
    message = EmailMessage()
    message["From"] = f"BoxSofa Europe <{address}>"
    message["To"] = candidate.email
    message["Subject"] = subject
    message.set_content(body)
    client = smtplib.SMTP_SSL(MAIL_HOST, SMTP_PORT, context=ssl.create_default_context(), timeout=20)
    try:
        client.login(address, password)
        client.send_message(message)
    finally:
        client.quit()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Inspect paid BoxSofa orders and safely send localized thank-you emails.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command in ("dry-run", "send"):
        child = subparsers.add_parser(command)
        child.add_argument("--limit", type=int, default=20)
        if command == "send":
            child.add_argument("--confirm-send", default="NO", help="Must be exactly YES to enable SMTP.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.limit < 1 or args.limit > 200:
        raise RuntimeError("--limit must be between 1 and 200.")
    if args.command == "send" and args.confirm_send != "YES":
        raise RuntimeError("Sending requires --confirm-send YES.")
    root = Path(__file__).resolve().parent.parent
    rows = fetch_orders(root)
    ledger = Ledger(ledger_path())
    candidates, manual_review = classify_orders(rows, ledger, args.limit)
    sent: list[str] = []
    failed: list[str] = []
    if args.command == "send":
        for candidate in candidates:
            try:
                send_candidate(candidate)
                ledger.record_success(candidate.order_number, candidate.locale, candidate.member_welcome)
                sent.append(candidate.order_number)
            except Exception:
                failed.append(candidate.order_number)
    result = {
        "ok": not failed,
        "mode": args.command,
        "candidateCount": len(candidates),
        "candidates": [
            {"orderNumber": item.order_number, "locale": item.locale, "memberWelcome": item.member_welcome}
            for item in candidates
        ],
        "sentOrderNumbers": sent,
        "failedOrderNumbers": failed,
        "manualReviewOrderNumbers": manual_review,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(json.dumps({"ok": False, "message": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
