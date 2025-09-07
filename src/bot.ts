import { Bot } from "https://deno.land/x/grammy@v1.38.2/mod.ts";
import "jsr:@std/dotenv/load";

const TOKEN = Deno.env.get("BOT_TOKEN");

if (TOKEN == undefined) {
  console.error("BOT_TOKEN is not set in environment variables.");
  throw new Error(
    "BOT_TOKEN is required but not found in environment variables"
  );
}

const bot = new Bot(TOKEN);

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

bot.hears(/\/echo (.+)/, (ctx) => ctx.reply(ctx.match[1]));

bot.hears("ping", (ctx) => ctx.reply("Pong!!!"));

bot.on("message", (ctx) => ctx.reply("Got another message!"));

export default bot;
