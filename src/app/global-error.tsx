"use client";

// Last-resort error screen, shown when the root layout itself fails. It replaces the whole
// document, so it cannot use the app's styles or translations: its colours are written here
// and follow the theme in src/app/globals.css by hand.
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
          background: "#ffffff",
          color: "#0f172a",
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
            borderRadius: 10,
            background: "#1d4ed8",
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
