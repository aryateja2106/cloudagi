import type { FC } from 'hono/jsx';

export const Landing: FC = () => {
  return (
    <>
      <section class="hero">
        <p class="subtitle"><span class="badge badge-coming">Beta</span></p>
        <h1>Stop Wasting Your AI Credits</h1>
        <p class="subtitle">
          See exactly how much of your coding agent subscriptions go unused every month.
          <br />Then sell what you don't need — or buy compute at a discount.
        </p>
      </section>

      <div class="terminal">
        <div><span class="prompt">$</span> npx cloudagi</div>
        <br />
        <div><span class="dim">CloudAGI Credit Probe v0.1.0</span></div>
        <br />
        <table style="width:100%;border-collapse:collapse;font-family:inherit;font-size:inherit;">
          <thead>
            <tr style="border-bottom:1px solid #565f89;">
              <th style="text-align:left;padding:4px 8px;color:#565f89;">Provider</th>
              <th style="text-align:left;padding:4px 8px;color:#565f89;">Plan</th>
              <th style="text-align:right;padding:4px 8px;color:#565f89;">Used</th>
              <th style="text-align:right;padding:4px 8px;color:#565f89;">Left</th>
              <th style="text-align:right;padding:4px 8px;color:#565f89;">Waste</th>
              <th style="text-align:left;padding:4px 8px;color:#565f89;">Window</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:4px 8px;">Claude</td>
              <td style="padding:4px 8px;">Max</td>
              <td style="text-align:right;padding:4px 8px;">76%</td>
              <td style="text-align:right;padding:4px 8px;">24%</td>
              <td style="text-align:right;padding:4px 8px;"><span class="warn">$5.36</span></td>
              <td style="padding:4px 8px;"><span class="massive">MASSIVE</span></td>
            </tr>
            <tr>
              <td style="padding:4px 8px;">Copilot</td>
              <td style="padding:4px 8px;">Individual</td>
              <td style="text-align:right;padding:4px 8px;">9%</td>
              <td style="text-align:right;padding:4px 8px;">91%</td>
              <td style="text-align:right;padding:4px 8px;"><span class="warn">$2.51</span></td>
              <td style="padding:4px 8px;"><span class="medium">MEDIUM</span></td>
            </tr>
            <tr>
              <td style="padding:4px 8px;">Cursor</td>
              <td style="padding:4px 8px;">Pro+</td>
              <td style="text-align:right;padding:4px 8px;">0%</td>
              <td style="text-align:right;padding:4px 8px;">100%</td>
              <td style="text-align:right;padding:4px 8px;"><span class="warn">$5.41</span></td>
              <td style="padding:4px 8px;"><span class="medium">MEDIUM</span></td>
            </tr>
            <tr>
              <td style="padding:4px 8px;">Codex</td>
              <td style="padding:4px 8px;">Pro</td>
              <td style="text-align:right;padding:4px 8px;">0%</td>
              <td style="text-align:right;padding:4px 8px;">100%</td>
              <td style="text-align:right;padding:4px 8px;"><span class="warn">$200.00</span></td>
              <td style="padding:4px 8px;"><span class="high">HIGH</span></td>
            </tr>
            <tr>
              <td style="padding:4px 8px;">Amp</td>
              <td style="padding:4px 8px;">Pro</td>
              <td style="text-align:right;padding:4px 8px;">0%</td>
              <td style="text-align:right;padding:4px 8px;">100%</td>
              <td style="text-align:right;padding:4px 8px;"><span class="warn">$20.00</span></td>
              <td style="padding:4px 8px;"><span class="high">HIGH</span></td>
            </tr>
          </tbody>
        </table>
        <br />
        <div>  Total Estimated Waste: <span class="warn" style="font-weight:bold;">$227.92</span></div>
        <br />
        <div class="dim">  Probed in 748ms</div>
        <br />
        <div>  <span class="success">Want to sell your unused credits?</span> Run: <span class="prompt">cloudagi sell --start</span></div>
      </div>

      <section class="cta" style="text-align:center;">
        <p>Try it now — one command, zero config:</p>
        <code>npx cloudagi</code>
        <div style="margin-top:1.5rem;display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
          <a href="/auth/github" class="btn-login" style="padding:0.75rem 1.5rem;font-size:1rem;">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Sign in to Sell Credits
          </a>
          <a href="/marketplace" style="padding:0.75rem 1.5rem;font-size:1rem;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;">Browse Marketplace</a>
        </div>
      </section>

      <section class="providers">
        <div class="provider">
          <div class="provider-icon">C</div>
          <div><strong>Claude</strong></div>
          <div class="badge badge-green">Supported</div>
        </div>
        <div class="provider">
          <div class="provider-icon">Co</div>
          <div><strong>Copilot</strong></div>
          <div class="badge badge-green">Supported</div>
        </div>
        <div class="provider">
          <div class="provider-icon">Cu</div>
          <div><strong>Cursor</strong></div>
          <div class="badge badge-green">Supported</div>
        </div>
        <div class="provider">
          <div class="provider-icon">Cx</div>
          <div><strong>Codex</strong></div>
          <div class="badge badge-green">Supported</div>
        </div>
        <div class="provider">
          <div class="provider-icon">A</div>
          <div><strong>Amp</strong></div>
          <div class="badge badge-green">Supported</div>
        </div>
      </section>

      <section class="features">
        <article class="feature">
          <h3>Detect Waste</h3>
          <p>Scan all your coding agent subscriptions in one command. See exactly what you're paying for vs. what you're using.</p>
        </article>
        <article class="feature">
          <h3>Sell Unused Credits</h3>
          <p>List your surplus agent compute on the marketplace. Other developers buy your unused credits at a discount. <span class="badge badge-coming">Coming Soon</span></p>
        </article>
        <article class="feature">
          <h3>Buy Cheap Compute</h3>
          <p>Need more AI coding power? Buy discounted credits from developers who aren't using theirs. <span class="badge badge-coming">Coming Soon</span></p>
        </article>
        <article class="feature">
          <h3>Monetize Local Models</h3>
          <p>Run local LLMs and sell compute to the community. Turn your GPU into a revenue stream. <span class="badge badge-coming">Coming Soon</span></p>
        </article>
      </section>
    </>
  );
};
