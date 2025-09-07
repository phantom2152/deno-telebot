import { Hono } from "https://deno.land/x/hono@v3.12.6/mod.ts";
import { webhookCallback } from "https://deno.land/x/grammy@v1.38.2/mod.ts";
import bot from "./bot.ts";
import { WebhookOptions } from "../types.ts";

const ENVIRONMENT = Deno.env.get("ENVIRONMENT") || "production";
const SECRET = Deno.env.get("WEBHOOK_SECRET");
const URL = Deno.env.get("WEBHOOK_URL");

let app: Hono | undefined;

if (ENVIRONMENT === "development") {
  console.log("🚀 Starting bot in development mode (polling)");
  bot.start();
} else {
  if (SECRET == undefined || URL == undefined) {
    console.error(
      "WEBHOOK_SECRET/WEBHOOK_URL is not set in environment variables."
    );
    throw new Error(
      "WEBHOOK_SECRET/WEBHOOK_URL is required but not found in environment variables"
    );
  }
  console.log("🌐 Starting bot in production mode (webhook)");

  app = new Hono();

  app.get("/", (c) => {
    return c.json({
      status: "Bot is running on Denoland!",
      mode: "webhook",
      environment: ENVIRONMENT,
    });
  });

  app.get("/webhookInfo", async (c) => {
    try {
      const info = await bot.api.getWebhookInfo();
      return c.json(info);
    } catch (error) {
      return c.json(
        {
          error: "Failed to get webhook info",
          details:
            typeof error === "object" && error !== null && "message" in error
              ? (error as { message: string }).message
              : String(error),
        },
        500
      );
    }
  });

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      mode: "webhook",
      environment: ENVIRONMENT,
    });
  });

  app.use("/webhook", webhookCallback(bot, "hono", { secretToken: SECRET }));

  (async () => {
    try {
      const webhook_url = URL.replace(/\/+$/, "") + "/webhook";
      const options: WebhookOptions = { secret_token: SECRET };
      await bot.api.setWebhook(webhook_url, options);
      console.log(`✅ Webhook set successfully at ${webhook_url}`);
    } catch (err) {
      console.error("❌ Failed to set webhook on startup:", err);
      throw new Error("❌ Failed to set webhook on startup:");
    }
  })();
}

export default app;
