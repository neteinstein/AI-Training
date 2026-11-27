"use client";

// Last-resort error screen, shown when the root layout itself fails. It replaces the whole
// document, so it cannot use the app's styles or translations: its colours are written here
// and follow the two themes in src/app/globals.css by hand. With no script to ask, it goes
// by what the device asks for.
const styles = `
  html { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    background: #ffffff;
    color: #0f172a;
    font-family: system-ui, sans-serif;
    text-align: center;
  }
  h1 { margin: 0; font-size: 28px; }
  button {
    min-height: 48px;
    padding: 0 24px;
    border: 0;
    border-radius: 10px;
    background: #1d4ed8;
    color: #ffffff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e6ebf4; }
    button { background: #8fb3ff; color: #0b1220; }
  }
`;

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt">
      <body>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <title>Erro · Error</title>
        <h1>Ocorreu um erro · Something went wrong</h1>
        <button type="button" onClick={() => retry()}>
          Tentar novamente · Try again
        </button>
      </body>
    </html>
  );
}
