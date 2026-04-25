import { createMcpHandler } from "mcp-handler"
import { z } from "zod"

export const runtime = "nodejs"

interface WttrHourly {
  precipMM?: string
  humidity?: string
  windspeedKmph?: string
  weatherDesc?: Array<{ value?: string }>
}

interface WttrDay {
  maxtempC: string
  mintempC: string
  avgtempC: string
  hourly?: WttrHourly[]
}

interface WttrJ1 {
  weather?: WttrDay[]
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "get_weather_forecast",
      "Get weather forecast for a city for the next 7 days. Use this to adapt running sessions based on temperature, rain, humidity and wind conditions.",
      {
        city: z.string().describe('City name e.g. "Buenos Aires", "Madrid", "New York"'),
        days: z.number().int().min(1).max(7).default(7).describe("Number of days to forecast"),
      },
      async ({ city, days }) => {
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`

        const res = await fetch(url, {
          headers: { "User-Agent": "PaceAI/1.0" },
        })

        if (!res.ok) {
          return {
            content: [{ type: "text" as const, text: `Weather API error: ${res.status}` }],
            isError: true,
          }
        }

        const data = (await res.json()) as WttrJ1

        const forecast =
          data.weather?.slice(0, days).map((day, i) => {
            const date = new Date()
            date.setDate(date.getDate() + i)
            const dateStr = date.toISOString().split("T")[0]
            const h = day.hourly?.[4]

            return {
              date: dateStr,
              maxTempC: parseInt(day.maxtempC, 10),
              minTempC: parseInt(day.mintempC, 10),
              avgTempC: parseInt(day.avgtempC, 10),
              precipMM: parseFloat(h?.precipMM ?? "0"),
              humidity: parseInt(h?.humidity ?? "0", 10),
              windKph: parseInt(h?.windspeedKmph ?? "0", 10),
              description: h?.weatherDesc?.[0]?.value ?? "",
              runningAdvice: getRunningSuggestion(
                parseInt(day.maxtempC, 10),
                parseFloat(h?.precipMM ?? "0"),
                parseInt(h?.humidity ?? "0", 10),
                parseInt(h?.windspeedKmph ?? "0", 10),
              ),
            }
          }) ?? []

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ city, forecast }, null, 2),
            },
          ],
        }
      },
    )
  },
  {},
  { basePath: "/api" },
)

function getRunningSuggestion(
  tempC: number,
  precipMM: number,
  humidity: number,
  windKph: number,
): string {
  if (precipMM > 5) return "Heavy rain expected — consider moving session indoors or swapping with rest day"
  if (tempC > 32) return "Extreme heat — run early morning, reduce pace by 30-45 sec/km, hydrate extra"
  if (tempC > 26) return "Hot conditions — reduce intensity, avoid midday, carry water"
  if (tempC < 5) return "Cold conditions — add warmup time, wear layers, watch for ice"
  if (windKph > 40) return "Strong wind — avoid tempo/interval work, run easy"
  if (humidity > 85) return "High humidity — perceived effort will be higher, reduce target pace"
  if (precipMM > 0 && precipMM <= 5) return "Light rain — run is fine, wear light waterproof layer"
  return "Good conditions for running"
}

export { handler as GET, handler as POST, handler as DELETE }
