/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permanent redirects for the Rush Engine -> Bookisdom rename. 308 (permanent:true)
  // preserves the HTTP method on redirect, so POST/DELETE calls from old bookmarked
  // clients or cached fetch() URLs (e.g. /api/rush/projects/:id DELETE) still work,
  // not just GET navigations. Old share links (/rush/share/[token]) must not 404.
  async redirects() {
    return [
      { source: "/rush", destination: "/bookisdom", permanent: true },
      { source: "/rush/:path*", destination: "/bookisdom/:path*", permanent: true },
      { source: "/api/rush/:path*", destination: "/api/bookisdom/:path*", permanent: true },
      { source: "/api/public/rush/:path*", destination: "/api/public/bookisdom/:path*", permanent: true },
    ];
  },
};

module.exports = nextConfig;
