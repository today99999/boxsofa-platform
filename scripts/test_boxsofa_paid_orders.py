import tempfile
import unittest
from pathlib import Path

from scripts.boxsofa_paid_orders import Ledger, classify_orders, member_welcome_for, render_email


def order(number, payment="paid", status="paid_confirmed", total=100, customer="customer-1", locale="en"):
    return {
        "id": number,
        "order_number": number,
        "customer_id": customer,
        "customer_email": "customer@example.com",
        "customer_name": "Alex",
        "payment_status": payment,
        "status": status,
        "total_eur": total,
        "paid_at": f"2026-07-24T10:{number[-1] if number[-1].isdigit() else '0'}0:00Z",
        "created_at": "2026-07-24T09:00:00Z",
        "locale": locale,
    }


class PaidOrderTests(unittest.TestCase):
    def test_classification_deduplication_retry_and_membership(self):
        with tempfile.TemporaryDirectory() as folder:
            ledger = Ledger(Path(folder) / "ledger.json")
            ledger.record_success("BX-SENT", "en", False)
            rows = [
                order("BX-PAID-1", total=200),
                order("BX-PENDING-2", payment="pending"),
                order("BX-REFUNDED-3", payment="refunded", status="refunded"),
                order("BX-UNCERTAIN-4", payment="paid", status="cancelled"),
                order("BX-SENT"),
                {**order("BX-MALFORMED-5"), "customer_email": "bad"},
            ]
            eligible, manual_review = classify_orders(rows, ledger, limit=20)
            self.assertEqual([item.order_number for item in eligible], ["BX-PAID-1"])
            self.assertEqual(manual_review, ["BX-REFUNDED-3", "BX-UNCERTAIN-4", "BX-MALFORMED-5"])
            self.assertFalse(ledger.was_sent("BX-FAILED-RETRY"))

            sequence = [order("BX-BELOW-1", total=250), order("BX-CROSS-2", total=60), order("BX-AFTER-3", total=80)]
            self.assertFalse(member_welcome_for(sequence, sequence[0]))
            self.assertTrue(member_welcome_for(sequence, sequence[1]))
            self.assertFalse(member_welcome_for(sequence, sequence[2]))

    def test_five_languages_and_english_fallback(self):
        expected = {
            "zh": "感谢您在 boxsofa.eu 购买我们的产品",
            "en": "Thank you for purchasing our products at boxsofa.eu",
            "es": "Gracias por comprar nuestros productos en boxsofa.eu",
            "fr": "Merci d’avoir acheté nos produits sur boxsofa.eu",
            "de": "Vielen Dank für Ihren Einkauf bei boxsofa.eu",
        }
        for locale, phrase in expected.items():
            subject, body = render_email(locale, "Alex", "BX-123", True)
            self.assertIn("BX-123", subject + body)
            self.assertIn("Alex", body)
            self.assertIn(phrase, body)
            self.assertIn("member", body.lower() if locale == "en" else render_email("en", "Alex", "BX-123", True)[1].lower())
        self.assertEqual(render_email("xx", "Alex", "BX-123", False), render_email("en", "Alex", "BX-123", False))


if __name__ == "__main__":
    unittest.main()
