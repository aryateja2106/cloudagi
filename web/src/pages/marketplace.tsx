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

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:1.5rem;margin:2rem 0;">
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
          <button style="margin-top:1rem;width:100%;" disabled>Buy Credits</button>
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
          <button style="margin-top:1rem;width:100%;" disabled>Buy Credits</button>
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
          <button style="margin-top:1rem;width:100%;" disabled>Buy Credits</button>
        </article>
      </div>

      <section style="text-align:center;padding:2rem 0;">
        <p style="color:var(--pico-muted-color);">
          <span class="badge badge-coming">Coming Soon</span>
          <br /><br />
          Marketplace will go live once GitHub OAuth and Stripe integration are complete.
          <br />
          The API is ready at <code>/api/marketplace/listings</code>
        </p>
      </section>

      <section class="features" style="margin-top:2rem;">
        <article class="feature">
          <h3>For Sellers</h3>
          <p>Run <code>cloudagi sell --start</code> to list your unused credits. Set your discount rate and we handle the rest. You get paid via Stripe.</p>
        </article>
        <article class="feature">
          <h3>For Buyers</h3>
          <p>Browse listings, pick a provider, and buy credits at a discount. Credits are transferred automatically via API delegation.</p>
        </article>
        <article class="feature">
          <h3>Platform Fee</h3>
          <p>CloudAGI takes a flat 10% fee on each transaction. Sellers keep 90% of the sale price. No hidden costs.</p>
        </article>
      </section>
    </>
  );
};
