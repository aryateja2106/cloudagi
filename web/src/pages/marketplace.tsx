import type { FC } from 'hono/jsx';

export const Marketplace: FC = () => {
  return (
    <>
      <section style="text-align:center;padding:2rem 0;">
        <h1>Credit Marketplace</h1>
        <p style="color:var(--pico-muted-color);">
          Buy discounted coding agent credits from developers who aren't using theirs.
        </p>
      </section>

      <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-bottom:2rem;">
        <button class="outline" style="border-radius:999px;padding:0.4rem 1rem;font-size:0.85rem;" data-provider="all">All Providers</button>
        <button class="outline secondary" style="border-radius:999px;padding:0.4rem 1rem;font-size:0.85rem;" data-provider="claude">Claude</button>
        <button class="outline secondary" style="border-radius:999px;padding:0.4rem 1rem;font-size:0.85rem;" data-provider="copilot">Copilot</button>
        <button class="outline secondary" style="border-radius:999px;padding:0.4rem 1rem;font-size:0.85rem;" data-provider="cursor">Cursor</button>
        <button class="outline secondary" style="border-radius:999px;padding:0.4rem 1rem;font-size:0.85rem;" data-provider="codex">Codex</button>
        <button class="outline secondary" style="border-radius:999px;padding:0.4rem 1rem;font-size:0.85rem;" data-provider="amp">Amp</button>
      </div>

      <div id="listings-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:1.5rem;margin:2rem 0;">
        <article style="padding:1.5rem;border-radius:12px;background:var(--pico-card-background-color);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
              <strong>Claude Max</strong>
              <div style="font-size:0.85rem;color:var(--pico-muted-color);">50% unused credits</div>
            </div>
            <span class="badge badge-green">30% off</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <span style="font-size:1.5rem;font-weight:bold;">$35</span>
              <span style="color:var(--pico-muted-color);text-decoration:line-through;margin-left:0.5rem;">$50</span>
            </div>
            <small style="color:var(--pico-muted-color);">Resets in 5 days</small>
          </div>
          <a href="/auth/github" style="display:block;margin-top:1rem;text-align:center;padding:0.6rem;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;">Sign in to Buy</a>
        </article>

        <article style="padding:1.5rem;border-radius:12px;background:var(--pico-card-background-color);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
              <strong>Cursor Pro+</strong>
              <div style="font-size:0.85rem;color:var(--pico-muted-color);">91% unused credits</div>
            </div>
            <span class="badge badge-green">40% off</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <span style="font-size:1.5rem;font-weight:bold;">$33</span>
              <span style="color:var(--pico-muted-color);text-decoration:line-through;margin-left:0.5rem;">$55</span>
            </div>
            <small style="color:var(--pico-muted-color);">Resets in 22 days</small>
          </div>
          <a href="/auth/github" style="display:block;margin-top:1rem;text-align:center;padding:0.6rem;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;">Sign in to Buy</a>
        </article>

        <article style="padding:1.5rem;border-radius:12px;background:var(--pico-card-background-color);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
              <strong>Codex Pro</strong>
              <div style="font-size:0.85rem;color:var(--pico-muted-color);">100% unused credits</div>
            </div>
            <span class="badge badge-green">25% off</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <span style="font-size:1.5rem;font-weight:bold;">$150</span>
              <span style="color:var(--pico-muted-color);text-decoration:line-through;margin-left:0.5rem;">$200</span>
            </div>
            <small style="color:var(--pico-muted-color);">Resets in 28 days</small>
          </div>
          <a href="/auth/github" style="display:block;margin-top:1rem;text-align:center;padding:0.6rem;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;">Sign in to Buy</a>
        </article>

        <article style="padding:1.5rem;border-radius:12px;background:var(--pico-card-background-color);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
              <strong>Copilot Individual</strong>
              <div style="font-size:0.85rem;color:var(--pico-muted-color);">80% unused credits</div>
            </div>
            <span class="badge badge-green">50% off</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <span style="font-size:1.5rem;font-weight:bold;">$4</span>
              <span style="color:var(--pico-muted-color);text-decoration:line-through;margin-left:0.5rem;">$8</span>
            </div>
            <small style="color:var(--pico-muted-color);">Resets in 18 days</small>
          </div>
          <a href="/auth/github" style="display:block;margin-top:1rem;text-align:center;padding:0.6rem;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;">Sign in to Buy</a>
        </article>

        <article style="padding:1.5rem;border-radius:12px;background:var(--pico-card-background-color);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
              <strong>Amp Pro</strong>
              <div style="font-size:0.85rem;color:var(--pico-muted-color);">100% unused credits</div>
            </div>
            <span class="badge badge-green">35% off</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div>
              <span style="font-size:1.5rem;font-weight:bold;">$13</span>
              <span style="color:var(--pico-muted-color);text-decoration:line-through;margin-left:0.5rem;">$20</span>
            </div>
            <small style="color:var(--pico-muted-color);">Resets tomorrow</small>
          </div>
          <a href="/auth/github" style="display:block;margin-top:1rem;text-align:center;padding:0.6rem;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;">Sign in to Buy</a>
        </article>
      </div>

      <section style="text-align:center;padding:1rem 0;margin-top:1rem;">
        <p style="color:var(--pico-muted-color);font-size:0.9rem;">
          These are example listings. Sign in with GitHub to create real listings from your probe data.
          <br />
          API available at <code>GET /api/marketplace/listings</code>
        </p>
      </section>

      <section class="features" style="margin-top:2rem;">
        <article class="feature">
          <h3>For Sellers</h3>
          <p>Run <code>npx cloudagi</code> to probe your waste, then sign in and list unused credits. Set your discount rate and get paid.</p>
        </article>
        <article class="feature">
          <h3>For Buyers</h3>
          <p>Browse listings, pick a provider, and buy credits at a discount. Pay via Stripe or x402 protocol.</p>
        </article>
        <article class="feature">
          <h3>10% Platform Fee</h3>
          <p>Flat 10% fee on each transaction. Sellers keep 90%. No hidden costs, transparent pricing.</p>
        </article>
      </section>
    </>
  );
};
