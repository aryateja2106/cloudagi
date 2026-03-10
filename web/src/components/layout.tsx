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
          nav { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; }
          nav .logo { font-weight: 700; font-size: 1.2rem; text-decoration: none; color: var(--pico-color); }
          nav .nav-links { display: flex; gap: 1.5rem; align-items: center; }
          nav .nav-links a { text-decoration: none; color: var(--pico-muted-color); font-size: 0.9rem; }
          nav .nav-links a:hover { color: var(--pico-color); }
          .btn-login { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 8px; background: #24292f; color: #fff !important; font-size: 0.85rem; font-weight: 600; text-decoration: none !important; }
          .btn-login:hover { background: #1b1f23; }
        `}</style>
      </head>
      <body>
        <header class="container">
          <nav>
            <a href="/" class="logo">CloudAGI</a>
            <div class="nav-links">
              <a href="/marketplace">Marketplace</a>
              <a href="/dashboard">Dashboard</a>
              <a href="/auth/github" class="btn-login">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                Sign in
              </a>
            </div>
          </nav>
        </header>
        <main class="container">
          {children}
        </main>
        <footer class="container">
          <p>CloudAGI - Agent Credit Economy &middot; <a href="https://cloudagi.ai" style="color:var(--pico-muted-color);">cloudagi.ai</a></p>
        </footer>
      </body>
    </html>
  );
};
