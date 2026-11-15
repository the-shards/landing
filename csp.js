// The Content-Security-Policy for the built site. vite.config.js injects it as a <meta> tag at build time only
// (the dev server needs an inline React-refresh script that this policy would block), the tests read it from the build,
// and README-deploy.md gives the same policy for the CloudFront response headers policy, which also adds frame-ancestors
// (a <meta> CSP ignores that one).
export function buildCsp(apiOrigin, { headers = false } = {}) {
  const parts = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "form-action 'self'",
    "base-uri 'none'",
  ];
  if (headers) parts.push("frame-ancestors 'none'");
  return parts.join('; ');
}
