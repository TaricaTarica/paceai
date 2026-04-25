import { createMCPClient } from "@ai-sdk/mcp"
import { z } from "zod"

/** Base URL of the app or explicit MCP HTTP endpoint (must expose `/api/mcp`). */
function resolveMcpHttpUrl(): string {
  const explicit = process.env.PACEAI_MCP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")
    return `https://${host}/api/mcp`
  }
  return "http://127.0.0.1:3000/api/mcp"
}

function formatWeatherBlock(city: string, toolBody: string): string {
  return `\nWEATHER FORECAST FOR ${city.toUpperCase()} (next 7 days, via MCP get_weather_forecast):\n${toolBody.trim()}\nConsider weather when scheduling sessions — move hard sessions away from rain/heat days.`
}

function textFromToolResult(result: unknown): string | null {
  if (typeof result === "string" && result.trim()) return result.trim()
  if (!result || typeof result !== "object") return null
  const r = result as { content?: Array<{ type?: string; text?: string }> }
  if (!Array.isArray(r.content)) return null
  const text = r.content.find((p) => p.type === "text")?.text
  return text?.trim() ?? null
}

/**
 * Fetches a 7-day-style weather summary by calling the PaceAI MCP tool over HTTP
 * ([AI SDK MCP client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)).
 * Returns null if the MCP server is unreachable or the tool fails.
 */
export async function tryWeatherContextViaMcp(city: string): Promise<string | null> {
  const base = resolveMcpHttpUrl()
  const mcpUrl = base.endsWith("/mcp") ? base : `${base.replace(/\/$/, "")}/api/mcp`

  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined
  try {
    client = await createMCPClient({
      transport: {
        type: "http",
        url: mcpUrl,
        headers: { "User-Agent": "PaceAI/1.0 (adapt-week)" },
      },
    })

    const tools = await client.tools({
      schemas: {
        get_weather_forecast: {
          inputSchema: z.object({
            city: z.string(),
            days: z.number().int().min(1).max(7).optional(),
          }),
        },
      },
    })

    const raw = await tools.get_weather_forecast.execute(
      { city, days: 7 },
      { messages: [], toolCallId: `paceai-adapt-weather-${Date.now()}` },
    )

    const text = textFromToolResult(raw)
    if (!text) return null
    return formatWeatherBlock(city, text)
  } catch {
    return null
  } finally {
    await client?.close()
  }
}
