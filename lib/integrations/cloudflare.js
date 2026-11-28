
import { config } from "../config/env.js";

export async function askAI(prompt) {
  if (!config.cloudflareWorkerUrl || !config.cloudflareProxySecret) {
    throw new Error("AI configuration is missing");
  }

  const response = await fetch(config.cloudflareWorkerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-proxy-secret": config.cloudflareProxySecret
    },
    body: JSON.stringify({ prompt })
  });

  const result = await response.json();

  if (!response.ok || !result.ok || typeof result.text !== "string") {
    throw new Error("AI service unavailable");
  }

  return result.text;
}
