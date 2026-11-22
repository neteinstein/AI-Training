import { notFound } from "next/navigation";

// Any path that no other route matches renders the localised not-found page.
export default function CatchAllPage() {
  notFound();
}
