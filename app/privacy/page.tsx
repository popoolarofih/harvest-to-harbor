import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy policy · Harvest to Harbor',
  description: 'How Harvest to Harbor, an educational farming and export game, handles your information.',
};

const EFFECTIVE = '19 October 2026';
// TODO(owner): replace with the address players, parents and schools should write to.
const CONTACT = 'the contact address published with this game';

/** Plain-language privacy policy. Kept short and readable on purpose: many players are students. */
export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <div className="eyebrow">Harvest to Harbor · Nigeria</div>
        <h1>Privacy policy</h1>
        <p className="legal-meta">Effective {EFFECTIVE}</p>

        <section className="legal-summary">
          <h2>The short version</h2>
          <ul>
            <li>There are <b>no accounts</b>, no sign-up and no real-money purchases.</li>
            <li>Your farm is saved <b>only in your own browser</b>. We never receive it.</li>
            <li>There are <b>no ads, no analytics and no tracking cookies</b>.</li>
            <li>The game loads its typefaces from Google Fonts, which means Google sees your IP address when the page loads.</li>
          </ul>
        </section>

        <section>
          <h2>1. Who we are and what this game is</h2>
          <p>
            Harvest to Harbor is an educational simulation about growing, processing and exporting ginger from Southern Kaduna, Nigeria.
            It teaches farming, food processing, trade and money management through play. Prices, yields and events in the game are simplified
            for learning. They are not live market data, financial advice or agronomic advice.
          </p>
        </section>

        <section>
          <h2>2. Information stored on your device</h2>
          <p>To let you continue where you left off, the game uses your browser&apos;s <i>local storage</i>. This stays on your device and is never sent to us:</p>
          <table className="legal-table">
            <thead><tr><th>Stored item</th><th>What it holds</th><th>Why</th></tr></thead>
            <tbody>
              <tr><td><code>h2h.save</code></td><td>Your farm: day, money, crops, stock, contracts, workers, level, and the names you typed for your farmer, farm and export brand.</td><td>So you can press <i>Continue Farming</i>.</td></tr>
              <tr><td><code>h2h.save.unreadable</code></td><td>A backup copy of a save that could not be opened (only if that ever happens).</td><td>So a damaged save is never lost; you can download it from the title screen.</td></tr>
              <tr><td><code>h2h.settings</code></td><td>Sound, music volume, reduced motion and screen orientation choices.</td><td>So your settings stick between visits.</td></tr>
            </tbody>
          </table>
          <p>
            The names in your farm profile are whatever you choose to type. We suggest players, especially children, use a made-up name rather
            than their real one. If you export your ledger as a CSV file, the file is created in your browser and saved straight to your device.
          </p>
        </section>

        <section>
          <h2>3. Information we collect</h2>
          <p>
            We do not collect personal information through the game. We do not run analytics, advertising, fingerprinting or tracking cookies,
            and the game does not ask for your location, camera, microphone or contacts.
          </p>
        </section>

        <section>
          <h2>4. Third-party services</h2>
          <p>
            <b>Google Fonts.</b> The game&apos;s typefaces are loaded from Google Fonts (<code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>).
            When your browser downloads them, Google receives your IP address and basic browser information, as with any website request. Google&apos;s
            handling of that data is described in the{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.
          </p>
          <p>
            <b>Hosting.</b> The company that hosts this website may keep standard server logs (such as IP address, time and page requested) for a short
            period to keep the service secure and working. These logs are not used to identify players.
          </p>
        </section>

        <section>
          <h2>5. Children and schools</h2>
          <p>
            Harvest to Harbor is suitable for students and is designed so that no personal information is needed to play. Because nothing is sent to us,
            we do not knowingly collect personal information from children. Teachers and parents who have questions can contact us using the details below.
          </p>
        </section>

        <section>
          <h2>6. Your choices: viewing and deleting your data</h2>
          <ul>
            <li><b>Start over:</b> choose <i>Start New Season</i> to replace your saved farm.</li>
            <li><b>Delete everything:</b> clear this site&apos;s data in your browser settings (often under <i>Privacy</i> → <i>Site data</i> or <i>Cookies and site data</i>). This removes the save and settings permanently.</li>
            <li><b>Play without saving:</b> in a private or incognito window, nothing is kept after you close it.</li>
          </ul>
        </section>

        <section>
          <h2>7. Security</h2>
          <p>
            Your save never leaves your device, so it is only as private as the device itself. On a shared or school computer, anyone using the same
            browser profile can continue your farm. Clear the site data when you finish if that matters to you.
          </p>
        </section>

        <section>
          <h2>8. Changes to this policy</h2>
          <p>
            If the game ever starts collecting information (for example, online accounts or leaderboards), we will update this page and the effective
            date before that change goes live, and explain it in plain language.
          </p>
        </section>

        <section>
          <h2>9. Contact</h2>
          <p>Questions about this policy can be sent to {CONTACT}.</p>
        </section>

        <p className="legal-back"><Link href="/">← Back to the game</Link></p>
      </article>
    </main>
  );
}
