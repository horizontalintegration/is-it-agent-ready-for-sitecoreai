interface GateBannerProps {
  reason: string;
}

export function GateBanner({ reason }: GateBannerProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mx-3 my-3">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-red-500 shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l6 6m0-6l-6 6" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Page excluded from AI features</p>
          <p className="text-sm text-red-700 mt-1">{reason}</p>
          <p className="text-xs text-red-600 mt-2">
            Fix this first — all other checks are suspended until this page is indexable and snippet-eligible.
          </p>
        </div>
      </div>
    </div>
  );
}
