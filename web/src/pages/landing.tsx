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
