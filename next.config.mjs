/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // mcp-handler pulls redis + MCP SDK with subpath requires; keep them external to the bundle
  serverExternalPackages: [
    "@ai-sdk/mcp",
    "mcp-handler",
    "@modelcontextprotocol/sdk",
    "redis",
  ],
}

export default nextConfig
