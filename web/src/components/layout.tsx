import type { FC, PropsWithChildren } from 'hono/jsx';

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content="See how much of your coding agent credits you're wasting. Buy and sell unused AI compute." />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />
        <style>{`
          :root {
            --pico-font-family: 'Inter', system-ui, -apple-system, sans-serif;
            --brand: #6366f1;
            --brand-light: #818cf8;
          }
          .hero { text-align: center; padding: 4rem 1rem; }
          .hero h1 { font-size: 3rem; margin-bottom: 0.5rem; }
          .hero .subtitle { font-size: 1.25rem; color: var(--pico-muted-color); margin-bottom: 2rem; }
          .terminal {
            background: #1a1b26; color: #a9b1d6; border-radius: 12px;
            padding: 1.5rem; font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem; text-align: left; max-width: 720px;
            margin: 2rem auto; overflow-x: auto; line-height: 1.6;
          }
          .terminal .prompt { color: #7aa2f7; }
          .terminal .success { color: #9ece6a; }
          .terminal .warn { color: #e0af68; }
          .terminal .error { color: #f7768e; }
          .terminal .dim { color: #565f89; }
          .terminal .massive { background: #9ece6a; color: #1a1b26; padding: 0 4px; border-radius: 3px; font-weight: bold; }
          .terminal .high { color: #9ece6a; font-weight: bold; }
          .terminal .medium { color: #e0af68; }
          .providers { display: flex; gap: 2rem; justify-content: center; flex-wrap: wrap; margin: 3rem 0; }
          .provider { text-align: center; padding: 1rem; }
          .provider-icon { font-size: 2rem; margin-bottom: 0.5rem; }
          .cta { margin: 3rem 0; }
          .cta code { background: var(--pico-code-background-color); padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1.1rem; }
          .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; margin: 4rem 0; }
          .feature { padding: 1.5rem; border-radius: 12px; background: var(--pico-card-background-color); }
          .feature h3 { margin-top: 0; }
          footer { text-align: center; padding: 2rem 0; color: var(--pico-muted-color); }
          .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
          .badge-green { background: #9ece6a22; color: #9ece6a; }
          .badge-yellow { background: #e0af6822; color: #e0af68; }
          .badge-coming { background: #6366f122; color: #818cf8; }
        `}</style>
      </head>
      <body>
        <main class="container">
          {children}
        </main>
        <footer class="container">
          <p>CloudAGI - Agent Credit Economy</p>
        </footer>
      </body>
    </html>
  );
};
