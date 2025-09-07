import { Bot, InputFile } from "https://deno.land/x/grammy@v1.38.2/mod.ts";
import "jsr:@std/dotenv/load";

const TOKEN = Deno.env.get("BOT_TOKEN");
if (!TOKEN) {
  console.error("BOT_TOKEN is not set in environment variables.");
  throw new Error(
    "BOT_TOKEN is required but not found in environment variables"
  );
}

const bot = new Bot(TOKEN);

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileName(url: string, headers: Headers): string {
  const contentDisposition = headers.get("content-disposition");
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(
      /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
    );
    if (filenameMatch && filenameMatch[1]) {
      return filenameMatch[1].replace(/['"]/g, "");
    }
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || "downloaded_file";

    if (!filename.includes(".")) {
      const contentType = headers.get("content-type");
      if (contentType) {
        const extensions: { [key: string]: string } = {
          "application/pdf": ".pdf",
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "image/gif": ".gif",
          "text/plain": ".txt",
          "application/zip": ".zip",
          "application/json": ".json",
          "video/mp4": ".mp4",
          "audio/mpeg": ".mp3",
        };
        const ext = extensions[contentType.split(";")[0]] || "";
        return filename + ext;
      }
    }

    return filename;
  } catch {
    return "downloaded_file";
  }
}

function createProgressBar(percent: number): string {
  const totalDots = 20;
  const filledDots = Math.floor((percent / 100) * totalDots);
  const emptyDots = totalDots - filledDots;
  return "█".repeat(filledDots) + "░".repeat(emptyDots);
}


bot.command("start", (ctx) =>
  ctx.reply("👋 Welcome! Use /send <url> to fetch and send a file.")
);


bot.command("send", async (ctx) => {
  const url = ctx.match?.trim();
  if (!url) {
    return ctx.reply(
      "❌ Please provide a URL. Example: /send https://example.com/file.pdf"
    );
  }

  let progressMsg: Awaited<ReturnType<typeof ctx.reply>> | null = null;
  let lastProgressText = "";

  try {

    const headRes = await fetch(url, { method: "HEAD" });
    if (!headRes.ok) {
      return ctx.reply(
        `❌ Failed to fetch file info. Status: ${headRes.status}`
      );
    }

    const contentLength = headRes.headers.get("content-length");
    if (!contentLength) {
      return ctx.reply("❌ Could not determine file size.");
    }

    const fileSize = parseInt(contentLength, 10);
    const maxSize = 50 * 1024 * 1024; // 50 MB (Telegram's limit)

    if (fileSize > maxSize) {
      return ctx.reply(
        `⚠️ File is too large (${formatFileSize(
          fileSize
        )}). Telegram limit is 50 MB.`
      );
    }

    // Get file information
    let fileName = getFileName(url, headRes.headers);
    fileName = decodeURIComponent(fileName);
    const contentType = headRes.headers.get("content-type") || "unknown";

    // Step 2: Display file information
    const fileInfo =
      `📁 **File Information**\n\n` +
      `📝 **Name:** ${fileName}\n` +
      `📊 **Size:** ${formatFileSize(fileSize)}\n` +
      `🏷️ **Type:** ${contentType}\n` +
      `🔗 **URL:** ${
        url.length > 50 ? url.substring(0, 50) + "..." : url
      }\n\n` +
      `Starting download...`;

    await ctx.reply(fileInfo, { parse_mode: "Markdown" });

    // Step 3: Start downloading with progress
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      return ctx.reply("❌ Failed to download file.");
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastUpdateTime = 0;
    let lastPercent = 0;

    // Send initial progress message
    const initialProgressText =
      "⬇️ Downloading file...\n" + createProgressBar(0) + " 0%";
    progressMsg = await ctx.reply(initialProgressText);
    lastProgressText = initialProgressText;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        chunks.push(value);
        received += value.length;

        const percent = Math.floor((received / fileSize) * 100);
        const currentTime = Date.now();

        if (currentTime - lastUpdateTime >= 3000 && percent > lastPercent) {
          lastUpdateTime = currentTime;
          lastPercent = percent;
          const progressBar = createProgressBar(percent);
          const newProgressText = `⬇️ Downloading file...\n${progressBar} ${percent}%`;

          // Only update if text actually changed
          if (newProgressText !== lastProgressText) {
            try {
              await ctx.api.editMessageText(
                ctx.chat.id,
                progressMsg.message_id,
                newProgressText
              );
              lastProgressText = newProgressText;
            } catch (editError: unknown) {
              const description =
                typeof editError === "object" &&
                editError !== null &&
                "description" in editError
                  ? (editError as { description?: string }).description
                  : String(editError);
              console.log("Progress update skipped:", description);
            }
          }
        }
      }
    }

    const completeBar = createProgressBar(100);
    const downloadCompleteText = `✅ Download complete!\n${completeBar} 100%\n\n📤 Uploading file...`;

    if (downloadCompleteText !== lastProgressText && progressMsg) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          progressMsg.message_id,
          downloadCompleteText
        );
        lastProgressText = downloadCompleteText;
      } catch (editError: unknown) {
        const description =
          typeof editError === "object" &&
          editError !== null &&
          "description" in editError
            ? (editError as { description?: string }).description
            : String(editError);
        console.log("Download complete update skipped:", description);
      }
    }

    // Step 4: Combine chunks into a Blob
    const fileData = new Blob(chunks, { type: contentType });

    // Step 5: Send the file back with proper name
    await ctx.replyWithChatAction("upload_document");

    try {
      await ctx.replyWithDocument(new InputFile(fileData, fileName), {
        caption: `📁 ${fileName}\n📊 Size: ${formatFileSize(fileSize)}`,
      });

      // Final update
      const finalSuccessText = `✅ File sent successfully!\n${completeBar} 100%\n\n📁 **${fileName}** (${formatFileSize(
        fileSize
      )})`;
      if (finalSuccessText !== lastProgressText && progressMsg) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            finalSuccessText
          );
        } catch (editError: unknown) {
          const description =
            typeof editError === "object" &&
            editError !== null &&
            "description" in editError
              ? (editError as { description?: string }).description
              : String(editError);
          console.log("Final update skipped:", description);
        }
      }
    } catch (uploadError) {
      console.error("Upload error:", uploadError);
      const errorText = `❌ Failed to upload file to Telegram.\n${completeBar} 100%\n\nFile may be too large or unsupported format.`;
      if (errorText !== lastProgressText && progressMsg) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            errorText
          );
        } catch (editError: unknown) {
          const description =
            typeof editError === "object" &&
            editError !== null &&
            "description" in editError
              ? (editError as { description?: string }).description
              : String(editError);
          console.log("Error update skipped:", description);
        }
      }
    }
  } catch (err) {
    console.error("Error in /send:", err);
    return ctx.reply("❌ Something went wrong while processing the file.");
  }
});

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err);
});

export default bot;
