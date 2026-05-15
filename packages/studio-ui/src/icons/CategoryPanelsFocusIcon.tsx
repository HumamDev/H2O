export function CategoryPanelsFocusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />

      <path d="M6.6 7.5H8.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7.5 6.6V8.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />

      <path d="M7.5 11V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.5 11V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 7.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 16.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
