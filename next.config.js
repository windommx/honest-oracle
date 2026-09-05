/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permanent redirects for two renames: Rush Engine -> Bookisdom, and
  // Honest Oracle -> โครงสร้างชีวิต (internal/URL slug: "lifemap"). 308
  // (permanent:true) preserves the HTTP method on redirect, so POST/DELETE
  // calls from old bookmarked clients or cached fetch() URLs still work, not
  // just GET navigations. Old share links (/rush/share/[token],
  // /oracle/share/[token]) must not 404.
  async redirects() {
    return [
      { source: "/rush", destination: "/bookisdom", permanent: true },
      { source: "/rush/:path*", destination: "/bookisdom/:path*", permanent: true },
      { source: "/api/rush/:path*", destination: "/api/bookisdom/:path*", permanent: true },
      { source: "/api/public/rush/:path*", destination: "/api/public/bookisdom/:path*", permanent: true },
      { source: "/oracle", destination: "/lifemap", permanent: true },
      { source: "/oracle/:path*", destination: "/lifemap/:path*", permanent: true },
      { source: "/api/oracle/:path*", destination: "/api/lifemap/:path*", permanent: true },
      { source: "/api/public/oracle/:path*", destination: "/api/public/lifemap/:path*", permanent: true },
    ];
  },
};

module.exports = nextConfig;
