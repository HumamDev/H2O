const SUPPORT_EMAIL = "support@cockpitpro.app";
const EARLY_ACCESS_LINK = `mailto:${SUPPORT_EMAIL}?subject=Early%20access%20request`;
const SUPPORT_LINK = `mailto:${SUPPORT_EMAIL}`;

type IconName =
  | "folder"
  | "map"
  | "bookmark"
  | "command"
  | "tag"
  | "shield"
  | "lock"
  | "user"
  | "card"
  | "check"
  | "arrow"
  | "alert";

type Feature = {
  icon: IconName;
  title: string;
  text: string;
};

const features: Feature[] = [
  {
    icon: "folder",
    title: "Library and folders",
    text: "Structure saved work with folders, labels, tags, and categories."
  },
  {
    icon: "map",
    title: "MiniMap navigation",
    text: "Move across long, complex sessions without losing your place."
  },
  {
    icon: "bookmark",
    title: "Saved chats",
    text: "Keep important sessions available for revisit, review, and reuse."
  },
  {
    icon: "command",
    title: "Command surfaces",
    text: "Give power users fast paths for search, navigation, and control."
  },
  {
    icon: "tag",
    title: "Labels and filters",
    text: "Make sprawling AI work searchable, sortable, and manageable."
  }
];

const useCases = [
  {
    title: "For operators",
    text: "Run research, planning, client work, and internal knowledge without context sprawl."
  },
  {
    title: "For builders",
    text: "Track decisions, prompts, revisions, references, and implementation threads in one place."
  },
  {
    title: "For teams later",
    text: "A product structure ready for identity, subscription, and shared workspace features."
  }
];

const faqs = [
  {
    question: "What is Cockpit Pro?",
    answer:
      "Cockpit Pro is a public-facing product and planned workspace layer for organizing and controlling complex AI sessions."
  },
  {
    question: "Is pricing live?",
    answer:
      "No. Pricing is still in early access planning. This site uses placeholder pricing language only."
  },
  {
    question: "Does this site include checkout?",
    answer:
      "No real payment flow is active. Checkout success and cancel pages are static placeholders for future billing support."
  },
  {
    question: "How do I request early access?",
    answer:
      "Use the early access button to email support@cockpitpro.app with your request."
  },
  {
    question: "Will browser or app data be sold?",
    answer:
      "No. The pre-launch privacy position is that personal data is not sold."
  },
  {
    question: "Where can I get support?",
    answer:
      "Email support@cockpitpro.app for account, billing, product, or bug report help."
  }
];

const pricingPlans = [
  {
    name: "Free",
    label: "Pricing coming soon",
    text: "A simple entry point for getting organized while Cockpit Pro is in early access.",
    items: ["Saved chat organization", "Basic folders and labels", "MiniMap-ready workflows"]
  },
  {
    name: "Pro",
    label: "Early access pricing",
    text: "For serious AI workspace users who need stronger control over complex sessions.",
    items: ["Advanced library structure", "Command surfaces", "Identity and subscription-ready account model"],
    featured: true
  },
  {
    name: "Max / Team later",
    label: "Coming later",
    text: "A future plan direction for heavier usage, shared workspaces, and team workflows.",
    items: ["Team workspace direction", "Shared organization concepts", "Priority support planning"]
  }
];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true
  };

  const strokeProps = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (name) {
    case "folder":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M3 7.5h6l2 2H21v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z" />
          <path {...strokeProps} d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1.5" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M8 18 3 20V6l5-2 8 2 5-2v14l-5 2-8-2Z" />
          <path {...strokeProps} d="M8 4v14M16 6v14" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M6 4h12v16l-6-3-6 3V4Z" />
        </svg>
      );
    case "command":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M7 7h10v10H7zM5 12h2M17 12h2M12 5v2M12 17v2" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M4 5v6.5L13.5 21 21 13.5 11.5 4H5a1 1 0 0 0-1 1Z" />
          <path {...strokeProps} d="M8.5 8.5h.01" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M12 3 20 6v6c0 5-3.3 8-8 9-4.7-1-8-4-8-9V6l8-3Z" />
          <path {...strokeProps} d="m8.5 12 2.3 2.3L16 9" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M6 10h12v10H6zM8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M3 6h18v12H3zM3 10h18M7 15h4" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path {...strokeProps} d="m5 12 4 4L19 6" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M12 3 22 20H2L12 3Z" />
          <path {...strokeProps} d="M12 9v5M12 17h.01" />
        </svg>
      );
  }
}

function Logo() {
  return (
    <a className="brand" href="/" aria-label="Cockpit Pro home">
      <span className="brand-mark" aria-hidden="true">
        C
      </span>
      <span>Cockpit Pro</span>
    </a>
  );
}

function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Logo />
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/#features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="/privacy">Privacy</a>
          <a href="/support">Support</a>
        </nav>
        <a className="nav-cta" href={EARLY_ACCESS_LINK}>
          Get early access
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <Logo />
          <p className="footer-note">The command center for your AI workspace.</p>
          <p className="copyright">Copyright 2026 Cockpit Pro. All rights reserved.</p>
        </div>
        <div>
          <h2>Product</h2>
          <a href="/#features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="/checkout/success">Checkout success</a>
          <a href="/checkout/cancel">Checkout cancel</a>
        </div>
        <div>
          <h2>Company</h2>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href={SUPPORT_LINK}>Contact support</a>
        </div>
        <div>
          <h2>Support</h2>
          <a href="/support">Help center</a>
          <a href={SUPPORT_LINK}>{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </footer>
  );
}

function ButtonLink({
  href,
  children,
  variant = "primary"
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <a className={`button ${variant}`} href={href}>
      <span>{children}</span>
      {variant === "primary" ? <Icon name="arrow" /> : null}
    </a>
  );
}

function ProductMockup() {
  return (
    <div className="product-frame" aria-label="Cockpit Pro workspace preview">
      <div className="mock-topbar">
        <span className="mock-dot" />
        <span className="mock-title">Cockpit Pro</span>
        <span className="mock-search">Type a command or search...</span>
        <span className="mock-status">Active</span>
      </div>
      <div className="mock-grid">
        <aside className="mock-sidebar">
          <p>Library</p>
          {["Workspace", "Research", "Client work", "Archive", "Starred"].map((item, index) => (
            <span className={index === 1 ? "is-active" : ""} key={item}>
              {item}
              <small>{index === 0 ? "24" : index === 1 ? "8" : index + 2}</small>
            </span>
          ))}
          <p>Labels</p>
          {["Project X", "Q2 planning", "Product", "Research"].map((item, index) => (
            <span className="label-row" key={item}>
              <i className={`label-dot tone-${index}`} />
              {item}
            </span>
          ))}
        </aside>
        <section className="mock-canvas">
          <div className="node main-node">Q2 strategy</div>
          <div className="node node-a">Market research</div>
          <div className="node node-b">User interviews</div>
          <div className="node node-c">Launch plan</div>
          <div className="node node-d">Competitor notes</div>
          <div className="node node-e">Pro draft</div>
          <span className="line line-1" />
          <span className="line line-2" />
          <span className="line line-3" />
          <span className="line line-4" />
        </section>
        <aside className="mock-detail">
          <p>MiniMap</p>
          <div className="mini-track">
            <span />
            <span />
            <span className="active" />
            <span />
            <span />
          </div>
          <p>Details</p>
          <dl>
            <div>
              <dt>Messages</dt>
              <dd>24</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Active</dd>
            </div>
          </dl>
        </aside>
      </div>
      <div className="command-bar">
        <span>Ask, navigate, organize...</span>
        <button type="button" aria-label="Command preview">
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <h1>Your AI workspace, under control.</h1>
            <p>
              Organize, navigate, save, and manage complex ChatGPT workflows with a cockpit built
              for serious work.
            </p>
            <div className="hero-actions">
              <ButtonLink href={EARLY_ACCESS_LINK}>Get early access</ButtonLink>
              <ButtonLink href="/pricing" variant="secondary">
                View pricing
              </ButtonLink>
            </div>
            <div className="hero-points" aria-label="Core capabilities">
              {[
                ["folder", "Organize", "Library, folders, labels"],
                ["map", "Navigate", "MiniMap for big sessions"],
                ["bookmark", "Save", "Chats and snapshots"],
                ["command", "Control", "Command surfaces"],
                ["lock", "Private by design", "Your data stays yours"]
              ].map(([icon, title, text]) => (
                <div key={title}>
                  <Icon name={icon as IconName} />
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <ProductMockup />
        </div>
      </section>

      <section className="section" id="features">
        <div className="shell">
          <div className="section-heading">
            <h2>Everything you need to command your AI workspace.</h2>
            <p>
              Cockpit Pro turns sprawling AI sessions into a structured workspace you can revisit,
              search, and control.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="panel feature-card" key={feature.title}>
                <Icon name={feature.icon} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-compact">
        <div className="shell split-section">
          <div>
            <h2>Built for work that keeps branching.</h2>
            <p>
              Research threads, implementation notes, prompts, decisions, and references rarely stay
              linear. Cockpit Pro is built for the real shape of modern AI work.
            </p>
          </div>
          <div className="use-case-list">
            {useCases.map((useCase) => (
              <article key={useCase.title}>
                <h3>{useCase.title}</h3>
                <p>{useCase.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PricingTeaser />
      <TrustSection />
      <FaqSection />
      <FinalCta />
    </>
  );
}

function PricingTeaser() {
  return (
    <section className="section" id="pricing">
      <div className="shell">
        <div className="section-heading">
          <h2>Simple pricing. Serious value.</h2>
          <p>Pricing coming soon. Early access pricing will be announced before billing opens.</p>
        </div>
        <div className="pricing-grid">
          {pricingPlans.map((plan) => (
            <article className={`panel price-card ${plan.featured ? "featured" : ""}`} key={plan.name}>
              <span className="plan-label">{plan.label}</span>
              <h3>{plan.name}</h3>
              <p>{plan.text}</p>
              <ul>
                {plan.items.map((item) => (
                  <li key={item}>
                    <Icon name="check" />
                    {item}
                  </li>
                ))}
              </ul>
              <ButtonLink href={plan.name.includes("Max") ? SUPPORT_LINK : EARLY_ACCESS_LINK} variant={plan.featured ? "primary" : "secondary"}>
                {plan.name.includes("Max") ? "Contact support" : "Get early access"}
              </ButtonLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const items: Feature[] = [
    {
      icon: "shield",
      title: "Privacy-aware by design",
      text: "A product direction built around user control and clear data boundaries."
    },
    {
      icon: "lock",
      title: "No data selling",
      text: "The pre-launch policy states that personal data is not sold."
    },
    {
      icon: "user",
      title: "Identity-ready",
      text: "The public site is prepared for account and subscription support without fake auth."
    },
    {
      icon: "card",
      title: "Billing support ready",
      text: "Static support pages are in place for future payment-provider workflows."
    }
  ];

  return (
    <section className="section section-compact">
      <div className="shell">
        <div className="section-heading">
          <h2>Your work is private and secure.</h2>
          <p>
            Cockpit Pro keeps the launch site simple while setting the right expectations for
            identity, support, and subscription features.
          </p>
        </div>
        <div className="trust-grid">
          {items.map((item) => (
            <article className="trust-item" key={item.title}>
              <Icon name={item.icon} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="section">
      <div className="shell">
        <div className="section-heading">
          <h2>Frequently asked questions</h2>
        </div>
        <div className="faq-grid">
          {faqs.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="section final-section">
      <div className="shell final-cta">
        <div>
          <h2>Take control of your AI workspace.</h2>
          <p>Join early access and help shape Cockpit Pro.</p>
        </div>
        <ButtonLink href={EARLY_ACCESS_LINK}>Get early access</ButtonLink>
      </div>
    </section>
  );
}

function PricingPage() {
  return (
    <main className="page-main">
      <PageHero
        title="Early access pricing"
        text="Pricing coming soon. Cockpit Pro is preparing simple plans for individuals, power users, and future team workflows."
      />
      <PricingTeaser />
      <section className="section section-compact">
        <div className="shell notice-panel">
          <Icon name="alert" />
          <div>
            <h2>No live billing yet</h2>
            <p>
              This page is a placeholder for launch readiness. Cockpit Pro does not currently run
              real checkout, Stripe integration, or subscription activation from this website.
            </p>
          </div>
        </div>
      </section>
      <FinalCta />
    </main>
  );
}

function SupportPage() {
  return (
    <main className="page-main">
      <PageHero
        title="Support"
        text="Get help with early access, billing questions, account planning, and product issues."
      />
      <section className="section">
        <div className="shell support-grid">
          <article className="panel">
            <h2>Contact</h2>
            <p>Email support for early access, account questions, billing support, or bug reports.</p>
            <ButtonLink href={SUPPORT_LINK}>Contact support</ButtonLink>
          </article>
          <article className="panel">
            <h2>Billing and account help</h2>
            <p>
              Billing is not live yet. Future payments will be handled by a payment provider, and
              this site will link to provider-backed support flows when available.
            </p>
          </article>
          <article className="panel">
            <h2>Bug reports</h2>
            <p>
              Include your browser, operating system, the page or feature involved, steps to
              reproduce, expected behavior, and screenshots if useful.
            </p>
          </article>
        </div>
      </section>
      <FaqSection />
    </main>
  );
}

function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      intro="Draft pre-launch policy. This page describes the privacy principles planned for Cockpit Pro before public billing and production account features are fully active."
      sections={[
        [
          "Information we may collect",
          "Cockpit Pro may collect account information, support messages, early access requests, product feedback, and basic technical information needed to operate and improve the service."
        ],
        [
          "Billing information",
          "Future billing will be handled by a payment provider. Cockpit Pro should not directly store full payment card details on this static public website."
        ],
        [
          "Browser extension and app data",
          "Cockpit Pro is designed around organizing user workspace activity. Product data principles are user control, clear purpose, low friction, and avoiding unnecessary collection."
        ],
        [
          "No sale of personal data",
          "Cockpit Pro does not plan to sell personal data. If this policy changes, the public policy should be updated before the change applies."
        ],
        [
          "Support messages",
          "Messages sent to support may be used to respond to requests, troubleshoot issues, and improve the product experience."
        ],
        [
          "Deletion and control",
          `Users may request deletion or correction of account-related information by contacting ${SUPPORT_EMAIL}.`
        ]
      ]}
    />
  );
}

function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      intro="Draft pre-launch terms. These terms are placeholders for the early stage public website and should be reviewed before paid subscriptions launch."
      sections={[
        [
          "Early stage software",
          "Cockpit Pro may change quickly during early access. The software and website are provided as-is during this stage."
        ],
        [
          "Acceptable use",
          "Do not misuse the service, attempt to disrupt it, abuse support channels, violate laws, or use Cockpit Pro to harm others."
        ],
        [
          "Account responsibility",
          "When account features become available, users will be responsible for maintaining accurate information and protecting access to their accounts."
        ],
        [
          "Subscriptions and refunds",
          "Subscription, cancellation, and refund terms are placeholders until real billing is available. Future billing terms should be published before paid checkout opens."
        ],
        [
          "Limitation of liability",
          "To the maximum extent allowed by law, Cockpit Pro will not be liable for indirect, incidental, or consequential damages from use of the early stage service."
        ],
        [
          "Contact",
          `Questions about these terms can be sent to ${SUPPORT_EMAIL}.`
        ]
      ]}
    />
  );
}

function PolicyPage({
  title,
  intro,
  sections
}: {
  title: string;
  intro: string;
  sections: [string, string][];
}) {
  return (
    <main className="page-main">
      <PageHero title={title} text={intro} />
      <section className="section">
        <div className="shell legal-wrap">
          {sections.map(([heading, text]) => (
            <article key={heading}>
              <h2>{heading}</h2>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function CheckoutStatusPage({
  variant
}: {
  variant: "success" | "cancel";
}) {
  const success = variant === "success";
  return (
    <main className="page-main status-main">
      <section className="shell status-card">
        <div className={`status-icon ${success ? "success" : "cancel"}`}>
          <Icon name={success ? "check" : "alert"} />
        </div>
        <h1>{success ? "Payment successful" : "Checkout cancelled"}</h1>
        <p>
          {success
            ? "Your Cockpit Pro access is being activated."
            : "No payment was completed."}
        </p>
        <div className="hero-actions center-actions">
          {success ? null : (
            <ButtonLink href="/pricing" variant="secondary">
              Back to pricing
            </ButtonLink>
          )}
          <ButtonLink href="/">Back to home</ButtonLink>
        </div>
      </section>
    </main>
  );
}

function PageHero({ title, text }: { title: string; text: string }) {
  return (
    <section className="page-hero">
      <div className="shell">
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <main className="page-main status-main">
      <section className="shell status-card">
        <h1>Page not found</h1>
        <p>The page you are looking for is not available.</p>
        <ButtonLink href="/">Back to home</ButtonLink>
      </section>
    </main>
  );
}

function routeFor(pathname: string) {
  switch (pathname.replace(/\/+$/, "") || "/") {
    case "/":
      return <LandingPage />;
    case "/pricing":
      return <PricingPage />;
    case "/privacy":
      return <PrivacyPage />;
    case "/terms":
      return <TermsPage />;
    case "/support":
      return <SupportPage />;
    case "/checkout/success":
      return <CheckoutStatusPage variant="success" />;
    case "/checkout/cancel":
      return <CheckoutStatusPage variant="cancel" />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  return (
    <>
      <Header />
      {routeFor(window.location.pathname)}
      <Footer />
    </>
  );
}
