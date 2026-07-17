import Link from "next/link";

export const metadata = {
  title: "Payment cancelled | BoxSofa",
  robots: {
    index: false,
    follow: false
  }
};

export default function CheckoutCancelPage({ searchParams }: { searchParams: { order?: string } }) {
  return (
    <main className="panel success-panel">
      <h1>Payment not completed</h1>
      <p>
        Your BoxSofa order{searchParams.order ? ` ${searchParams.order}` : ""} was saved, but payment was not completed.
      </p>
      <p>You can contact BoxSofa support or place the order again when you are ready.</p>
      <Link className="button primary" href="/cart">
        Return to cart
      </Link>
    </main>
  );
}
