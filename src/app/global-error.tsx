"use client";

// Last-resort error screen, shown when the root layout itself fails. It replaces the whole
// document, so it cannot use the app's styles or translations.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          background: "#fffbf5",
          color: "#1c1917",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <title>Erro · Error</title>
        <h1 style={{ margin: 0, fontSize: 28 }}>Ocorreu um erro · Something went wrong</h1>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            minHeight: 48,
            padding: "0 24px",
            border: 0,
            borderRadius: 12,
            background: "#166534",
            color: "#ffffff",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tentar novamente · Try again
        </button>
      </body>
    </html>
  );
}
