import Link from "next/link";

export const metadata = {
  title: "Payment received | BoxSofa",
  robots: {
    index: false,
    follow: false
  }
};

export default function CheckoutSuccessPage({ searchParams }: { searchParams: { order?: string } }) {
  return (
    <main className="panel success-panel">
      <h1>Payment received</h1>
      <p>
        Thank you. Your BoxSofa order{searchParams.order ? ` ${searchParams.order}` : ""} has been paid and is waiting
        for preparation.
      </p>
      <p>Payment confirmation can take a short moment to appear while Stripe notifies BoxSofa securely.</p>
      <Link className="button primary" href="/orders">
        View My Orders
      </Link>
    </main>
  );
}
