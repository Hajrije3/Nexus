/** The NEXUS mark: an isometric cube — three edges meeting at one point. */
export function NexusMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M12 12v9.5M12 12 3.5 7.25M12 12l8.5-4.75" />
    </svg>
  );
}
