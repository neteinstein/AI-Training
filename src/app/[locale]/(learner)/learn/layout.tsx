import type { Metadata } from "next";

// Nothing behind sign-in is for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Each learner page brings its own header, because the header shows the way back. */
export default function LearnLayout({ children }: LayoutProps<"/[locale]/learn">) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
