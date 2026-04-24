import type { Metadata } from "next";
import { LegalDocLayout, LegalH2, LegalP, LegalUl } from "@/components/legal/legal-doc-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — Axiom VLA",
  description: "How Axiom VLA collects, uses, and protects personal and claim-related data.",
};

export default function PrivacyPage() {
  return (
    <LegalDocLayout title="Privacy Policy" lastUpdated="April 23, 2026">
      <LegalP>
        This Privacy Policy describes how the Axiom VLA Service (“we,” “us,” or “our”) handles information when you
        use the web application and related features. It applies to visitors, registered users, and organization
        members who access a deployment of the Service.
      </LegalP>

      <LegalH2>1. Information we collect</LegalH2>
      <LegalP>Depending on how you use the Service, we may process:</LegalP>
      <LegalUl>
        <li>
          <strong className="text-foreground">Account data:</strong> such as name, email address, authentication
          identifiers, and organization membership.
        </li>
        <li>
          <strong className="text-foreground">Claim and evidence data:</strong> claim numbers, jurisdiction, file
          metadata, uploaded evidence (video, images, PDFs, audio), and AI-generated analysis stored with the claim.
        </li>
        <li>
          <strong className="text-foreground">Technical data:</strong> server logs, IP address, device/browser
          information, and diagnostic data used to secure and improve reliability of the Service.
        </li>
        <li>
          <strong className="text-foreground">Communications:</strong> messages you send us (e.g., support requests)
          if applicable to your deployment.
        </li>
      </LegalUl>
      <LegalP>
        <strong className="text-foreground">PII in exports and analysis:</strong> Evidence such as police reports or
        statements may contain names, addresses, or other identifiers. The Service does not automatically redact that
        information from stored analysis or JSON exports. Your organization is responsible for lawful collection,
        access controls, retention, and any redaction required before sharing outputs externally.
      </LegalP>

      <LegalH2>2. How we use information</LegalH2>
      <LegalP>We use information to:</LegalP>
      <LegalUl>
        <li>Provide, operate, and secure the Service (including authentication and organization scoping).</li>
        <li>Process uploads, run analysis workflows, and display results in the product.</li>
        <li>Send transactional messages (e.g., analysis-complete email) when configured for your deployment.</li>
        <li>Maintain logs for security, abuse prevention, and troubleshooting.</li>
        <li>Comply with law and enforce our Terms of Service.</li>
      </LegalUl>
      <LegalP>
        <strong className="text-foreground">Model training:</strong> Unless you have a separate written agreement
        expressly allowing it, we do not use your claim evidence or adjuster outcomes to train generalized models for
        other customers.
      </LegalP>

      <LegalH2>3. Legal bases (EEA / UK readers)</LegalH2>
      <LegalP>
        Where GDPR or UK GDPR applies, we rely on contract (to deliver the Service), legitimate interests (security,
        product improvement that does not override your rights), and, where required, consent or legal obligation.
      </LegalP>

      <LegalH2>4. Sharing and subprocessors</LegalH2>
      <LegalP>We share information with:</LegalP>
      <LegalUl>
        <li>
          <strong className="text-foreground">Infrastructure and auth providers</strong> (e.g., database, object
          storage, identity) that host and protect your data.
        </li>
        <li>
          <strong className="text-foreground">AI providers</strong> that process evidence or text you submit, solely to
          produce outputs returned to your workspace.
        </li>
        <li>
          <strong className="text-foreground">Email delivery</strong> when outbound notifications are enabled.
        </li>
        <li>
          <strong className="text-foreground">Professional advisers, regulators, or law enforcement</strong> when
          required by law or to protect rights and safety.
        </li>
      </LegalUl>
      <LegalP>We do not sell your personal information as “sale” is defined under U.S. state privacy laws.</LegalP>

      <LegalH2>5. Retention</LegalH2>
      <LegalP>
        We retain information for as long as needed to provide the Service and as required by law or your organization’s
        agreement. Users with deletion rights in the product may remove claims and evidence as described in-app; your
        organization may also define retention schedules in its pilot or enterprise agreement.
      </LegalP>

      <LegalH2>6. Security</LegalH2>
      <LegalP>
        We implement administrative, technical, and organizational measures appropriate to the sensitivity of claim
        data. No method of transmission or storage is completely secure; you should protect account credentials and
        follow your employer’s security policies.
      </LegalP>

      <LegalH2>7. International transfers</LegalH2>
      <LegalP>
        Your data may be processed in the United States or other countries where subprocessors operate. Where required,
        we use appropriate safeguards (such as standard contractual clauses) as determined by the operator of your
        deployment.
      </LegalP>

      <LegalH2>8. Your rights and choices</LegalH2>
      <LegalP>
        Depending on your location, you may have rights to access, correct, delete, or export personal data, or to object
        to certain processing. Submit requests through your organization’s administrator or the contact below. We may
        verify your identity before responding.
      </LegalP>

      <LegalH2>9. Children</LegalH2>
      <LegalP>The Service is not directed to children under 16, and we do not knowingly collect their data.</LegalP>

      <LegalH2>10. Changes to this policy</LegalH2>
      <LegalP>
        We may update this Privacy Policy from time to time. The “Last updated” date reflects the latest version.
        Material changes may require additional notice under your agreement or applicable law.
      </LegalP>

      <LegalH2>11. Contact</LegalH2>
      <LegalP>
        For privacy questions or requests, contact the administrator or privacy contact for your Axiom VLA deployment.
      </LegalP>
    </LegalDocLayout>
  );
}
