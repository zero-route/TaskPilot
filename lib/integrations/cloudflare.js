
import { config } from "../config/env.js";

export async function askAI(prompt) {
  if (!config.cloudflareWorkerUrl || !config.cloudflareProxySecret) {
    throw new Error("Konfigurasi Cloudflare belum lengkap.");
  }

  let response;

  try {
    response = await fetch(config.cloudflareWorkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-secret": config.cloudflareProxySecret
      },
      body: JSON.stringify({ prompt })
    });
  } catch (error) {
    throw new Error(`Cloudflare tidak dapat dihubungi: ${error.message}`);
  }

  const raw = await response.text();
  let result;

  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(`Respons Cloudflare bukan JSON. HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  if (!response.ok || !result.ok || typeof result.text !== "string") {
    const detail = result.error?.message ||
      result.error ||
      result.message ||
      result.text ||
      raw;

    throw new Error(`Cloudflare/Gemini HTTP ${response.status}: ${String(detail).slice(0, 300)}`);
  }

  return result.text;
}
