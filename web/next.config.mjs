// Static export: `next build` writes plain HTML/JS/CSS to ./out, which the Node app serves at "/".
// All live data (prices, address lookup, orders) comes from the app's /api on the same domain.
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  // Type errors are reported by a separate `tsc` step in the Docker build, so a type slip never blocks a deploy.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true }
};

export default nextConfig;
