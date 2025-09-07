import {
  Bot,
  webhookCallback,
} from "https://deno.land/x/grammy@v1.38.2/mod.ts";
import "jsr:@std/dotenv/load";
import { Hono } from "https://deno.land/x/hono@v3.12.6/mod.ts";

const TOKEN = Deno.env.get("BOT_TOKEN");

if (TOKEN == undefined) {
  console.error("BOT_TOKEN is not set in environment variables.");
  Deno.exit(1);
}

// Create an instance of the `Bot` class and pass your bot token to it.
const bot = new Bot(TOKEN);

// You can now register listeners on your bot object `bot`.
// grammY will call the listeners when users send messages to your bot.

// Handle the /start command.
bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));
// Handle other messages.
bot.hears(/\/echo (.+)/, (ctx) => ctx.reply(ctx.match[1]));

bot.on("message", (ctx) => ctx.reply("Got another message!"));

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "Bot is running on Cloudflare Workers!" });
});

app.post("/setWebhook", async (c) => {
  const { url } = await c.req.json();

  if (!url) {
    return c.json({ error: "URL is required" }, 400);
  }

  try {
    await bot.api.setWebhook(url);
    return c.json({
      success: true,
      message: "Webhook set successfully",
      url: url,
    });
  } catch (error) {
    return c.json(
      {
        error: "Failed to set webhook",
        details:
          typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : String(error),
      },
      500
    );
  }
});

app.post("/deleteWebhook", async (c) => {
  try {
    await bot.api.deleteWebhook();
    return c.json({
      success: true,
      message: "Webhook deleted successfully",
    });
  } catch (error) {
    return c.json(
      {
        error: "Failed to delete webhook",
        details:
          typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : String(error),
      },
      500
    );
  }
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

app.use("/webhook", webhookCallback(bot, "hono"));

export default app;
