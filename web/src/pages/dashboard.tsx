import type { FC } from 'hono/jsx';

export const Dashboard: FC = () => {
  return (
    <>
      <section style="text-align:center;padding:2rem 0;">
        <h1>Agent Credit Dashboard</h1>
        <p style="color:var(--pico-muted-color);">
          Upload your probe results to track credit usage over time.
        </p>
      </section>

      <article style="text-align:center;padding:3rem;">
        <h2>Coming Soon</h2>
        <p>
          Run the probe and upload results:
        </p>
        <pre style="text-align:left;max-width:600px;margin:1rem auto;">
{`$ npx cloudagi --json > probe.json
$ curl -X POST https://cloudagi.ai/api/probe \\
    -H "Content-Type: application/json" \\
    -d @probe.json`}
        </pre>
        <p style="color:var(--pico-muted-color);margin-top:2rem;">
          GitHub OAuth login and automatic tracking will be available soon.
        </p>
      </article>
    </>
  );
};
