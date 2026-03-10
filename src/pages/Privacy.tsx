import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-6 py-16 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: 10 March 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Who We Are</h2>
            <p>
              Property Motion ("we", "us", "our") operates the propertymotion.app platform — a SaaS tool that generates
              professional property videos and virtual staging for real estate agents. Our contact email is{" "}
              <a href="mailto:hello@propertymotion.com" className="text-primary hover:underline">
                hello@propertymotion.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Information We Collect</h2>
            <p>We collect the following categories of personal information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account data:</strong> name, email address, and password (hashed) when you create an account.</li>
              <li><strong>Payment data:</strong> billing information is processed by Stripe. We store only your Stripe customer ID, subscription status, and last four digits of your payment method. We never see or store full card numbers.</li>
              <li><strong>Property images:</strong> photos you upload or that we scrape from listing URLs you provide. These may include property interiors, exteriors, and listing details.</li>
              <li><strong>Generated content:</strong> videos, staged images, scripts, and audio files created through our platform.</li>
              <li><strong>Usage data:</strong> pages visited, features used, video generation counts, browser type, and IP address (hashed for abuse detection).</li>
              <li><strong>Communications:</strong> emails, support requests, and feedback you send us.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide and improve our video generation and virtual staging services.</li>
              <li>To process payments and manage your subscription.</li>
              <li>To detect and prevent fraud, abuse, and multi-account misuse.</li>
              <li>To send transactional emails (account confirmations, billing receipts, service updates).</li>
              <li>To provide customer support.</li>
              <li>To analyse usage patterns and improve our product (anonymised/aggregated where possible).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Third-Party Processors</h2>
            <p>We share data with the following service providers who process data on our behalf:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Supabase</strong> — database, authentication, and file storage (SOC 2 Type 2 compliant).</li>
              <li><strong>Stripe</strong> — payment processing (PCI DSS Level 1 compliant).</li>
              <li><strong>Anthropic (Claude)</strong> — AI script generation. Property descriptions may be sent to generate video scripts. No images are stored by Anthropic.</li>
              <li><strong>Luma AI / Runway ML / Shotstack</strong> — video generation. Property images are sent to generate video clips.</li>
              <li><strong>ElevenLabs</strong> — text-to-speech voiceover generation.</li>
              <li><strong>Autoenhance.ai / Decor8 AI</strong> — photo enhancement and virtual staging.</li>
              <li><strong>Scrapingdog</strong> — listing URL scraping (only processes URLs you provide).</li>
              <li><strong>Resend</strong> — transactional email delivery.</li>
            </ul>
            <p className="mt-2">
              Each processor is bound by their own privacy policies and data processing agreements. We only share the
              minimum data necessary for each service to function.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account data:</strong> retained while your account is active. Deleted within 30 days of account deletion request.</li>
              <li><strong>Property images and videos:</strong> retained while your account is active. After subscription cancellation, files are retained for 90 days then automatically deleted.</li>
              <li><strong>Payment records:</strong> retained for 7 years as required by Australian tax law.</li>
              <li><strong>Usage logs and IP hashes:</strong> rate-limiting records are automatically purged after 24 hours. Aggregated analytics are retained indefinitely.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access</strong> the personal data we hold about you.</li>
              <li><strong>Correct</strong> inaccurate or incomplete data.</li>
              <li><strong>Delete</strong> your personal data (subject to legal retention requirements).</li>
              <li><strong>Export</strong> your data in a portable format.</li>
              <li><strong>Object</strong> to or restrict certain processing activities.</li>
              <li><strong>Withdraw consent</strong> where processing is based on consent.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, email us at{" "}
              <a href="mailto:hello@propertymotion.com" className="text-primary hover:underline">
                hello@propertymotion.com
              </a>. We will respond within 30 days (or 45 days for CCPA requests).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. California Residents (CCPA)</h2>
            <p>If you are a California resident, you have additional rights under the CCPA:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Right to know what personal information is collected, used, shared, or sold.</li>
              <li>Right to delete personal information held by us.</li>
              <li>Right to opt out of the sale of personal information. <strong>We do not sell your personal information.</strong></li>
              <li>Right to non-discrimination for exercising your CCPA rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Cookies</h2>
            <p>
              We use essential cookies for authentication and session management. We may use analytics cookies
              (with your consent) to understand how our service is used. You can manage cookie preferences in your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Security</h2>
            <p>
              We implement industry-standard security measures including HTTPS encryption, row-level security on all database tables,
              JWT-based authentication on all API endpoints, hashed passwords, and environment-separated API keys. Property images
              are stored in access-controlled storage buckets. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Children</h2>
            <p>
              Our service is not directed at children under 18. We do not knowingly collect personal information from
              children. If you believe a child has provided us with personal information, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or
              through a notice on our platform. Your continued use of the service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Contact</h2>
            <p>
              For privacy-related questions or requests, contact us at{" "}
              <a href="mailto:hello@propertymotion.com" className="text-primary hover:underline">
                hello@propertymotion.com
              </a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
