"use client";

import Error from "next/error";

// Reached only by paths the proxy skips (anything with a file extension, e.g. /unknown.txt).
// Every other unknown path gets the localised page in [locale]/not-found.tsx.
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <Error statusCode={404} />
      </body>
    </html>
  );
}
