import type { Metadata } from "next";
import { LegalDocLayout, LegalH2, LegalP, LegalUl } from "@/components/legal/legal-doc-layout";

export const metadata: Metadata = {
  title: "Terms of Service — Axiom VLA",
  description: "Terms governing use of the Axiom VLA evidence review service for insurance professionals.",
};

export default function TermsPage() {
  return (
    <LegalDocLayout title="Terms of Service" lastUpdated="April 23, 2026">
      <LegalP>
        These Terms of Service (“Terms”) govern access to and use of the Axiom VLA web application and related
        services (collectively, the “Service”). By using the Service, you agree to these Terms on behalf of yourself
        and, if applicable, the organization you represent.
      </LegalP>

      <LegalH2>1. The Service</LegalH2>
      <LegalP>
        Axiom VLA provides tools to upload, organize, and obtain <strong className="text-foreground">AI-assisted</strong>{" "}
        analysis of claim-related evidence (such as video, images, documents, and audio). Outputs are intended as{" "}
        <strong className="text-foreground">decision support for licensed adjusters and other qualified reviewers</strong>
        — not as a final determination of liability, coverage, or damages.
      </LegalP>
      <LegalP>
        The Service does not provide legal advice. You remain responsible for compliance with applicable laws,
        regulations, carrier guidelines, and professional standards.
      </LegalP>

      <LegalH2>2. Accounts and organizations</LegalH2>
      <LegalP>
        Access may require an account tied to an organization (“workspace”). You must provide accurate registration
        information and safeguard your credentials. You are responsible for activity under your account unless you
        notify us promptly of unauthorized use (through the administrator who operates your deployment).
      </LegalP>

      <LegalH2>3. Acceptable use</LegalH2>
      <LegalP>You agree not to:</LegalP>
      <LegalUl>
        <li>Use the Service for any unlawful purpose or in violation of third-party rights.</li>
        <li>Upload malware, attempt to disrupt or probe the Service, or circumvent security or rate limits.</li>
        <li>
          Rely on AI outputs as a substitute for independent professional judgment, investigation, or verification
          where your duties require it.
        </li>
        <li>
          Misrepresent AI-generated content as human-prepared court filings or official determinations without
          appropriate disclosure.
        </li>
      </LegalUl>

      <LegalH2>4. Your content</LegalH2>
      <LegalP>
        You retain rights to evidence and data you upload. You grant the Service permission to host, process, and
        analyze that content solely to provide the Service (including invoking third-party AI and infrastructure
        providers as described in the Privacy Policy). You represent that you have the rights and, where required,
        consents to upload content for this purpose.
      </LegalP>

      <LegalH2>5. AI limitations and disclaimers</LegalH2>
      <LegalP>
        Artificial intelligence systems can be wrong, incomplete, or inconsistent. The Service may flag uncertainty or
        route work for review, but it cannot guarantee accuracy.{" "}
        <strong className="text-foreground">
          Final liability and claim decisions remain your and your organization’s responsibility.
        </strong>
      </LegalP>

      <LegalH2>6. Third-party services</LegalH2>
      <LegalP>
        The Service relies on subprocessors (e.g., cloud hosting, authentication, email, and AI model providers). Their
        availability and terms may affect the Service. A high-level description appears in the Privacy Policy.
      </LegalP>

      <LegalH2>7. Intellectual property</LegalH2>
      <LegalP>
        The Service, including software, branding, and documentation, is protected by intellectual property laws. Except
        for the limited rights necessary to use the Service, no rights are granted to you.
      </LegalP>

      <LegalH2>8. Disclaimer of warranties</LegalH2>
      <LegalP>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL
        WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT.
      </LegalP>

      <LegalH2>9. Limitation of liability</LegalH2>
      <LegalP>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER WE NOR OUR SUPPLIERS WILL BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL. OUR
        AGGREGATE LIABILITY ARISING OUT OF THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS
        YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (US$100),
        IF NO FEES APPLIED.
      </LegalP>

      <LegalH2>10. Indemnity</LegalH2>
      <LegalP>
        You will defend and indemnify us against claims arising from your content, your misuse of the Service, or your
        violation of these Terms, subject to applicable law.
      </LegalP>

      <LegalH2>11. Suspension and termination</LegalH2>
      <LegalP>
        We may suspend or terminate access for conduct that risks the Service, other users, or legal compliance.
        You may stop using the Service at any time. Provisions that by their nature should survive will survive
        termination.
      </LegalP>

      <LegalH2>12. Changes</LegalH2>
      <LegalP>
        We may update these Terms from time to time. We will post the revised Terms with an updated “Last updated”
        date. Continued use after changes become effective constitutes acceptance, except where applicable law requires
        additional notice or consent.
      </LegalP>

      <LegalH2>13. General</LegalH2>
      <LegalP>
        These Terms are governed by the laws of the jurisdiction designated by the operator of your deployment,
        excluding conflict-of-law rules. If a provision is unenforceable, the remainder stays in effect. Failure to
        enforce a provision is not a waiver.
      </LegalP>

      <LegalH2>14. Contact</LegalH2>
      <LegalP>
        For questions about these Terms, contact the administrator or legal contact for your Axiom VLA deployment.
      </LegalP>
    </LegalDocLayout>
  );
}
