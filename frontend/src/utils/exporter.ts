import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { captureRef } from "react-native-view-shot";

export async function downloadBase64Web(b64: string, filename: string) {
  if (Platform.OS !== "web") return false;
  const a = document.createElement("a");
  a.href = `data:image/png;base64,${b64}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

export async function exportView(ref: any, filename: string) {
  if (Platform.OS === "web") {
    const uri = await captureRef(ref, { format: "png", quality: 1, result: "data-uri" });
    const a = document.createElement("a");
    a.href = uri as string;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "downloaded";
  }
  const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri as string);
  }
  return "shared";
}

export async function exportPlanPdf(project: any) {
  const tasks = (project.tasks || [])
    .map((t: any) => `<li>${t.done ? "✓ " : "○ "}${t.text}</li>`)
    .join("");
  const html = `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{font-family:-apple-system,Helvetica,Arial;padding:40px;color:#111}
      h1{font-size:30px;margin-bottom:4px}
      .pitch{font-style:italic;color:#8a6033;font-size:18px;margin:8px 0 24px}
      h2{font-size:15px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-top:24px}
      p{line-height:1.6}
      ul{line-height:1.8}
      .foot{margin-top:48px;color:#bbb;font-size:12px}
    </style></head>
    <body>
      <h1>${project.title || "Project"}</h1>
      <div class="pitch">"${project.pitch || ""}"</div>
      <h2>Summary</h2><p>${project.summary || ""}</p>
      <h2>Target Audience</h2><p>${project.target_audience || ""}</p>
      <h2>Value Proposition</h2><p>${project.value_prop || ""}</p>
      <h2>Next Steps</h2><ul>${tasks}</ul>
      <div class="foot">Made with CreatorForge — AI-assisted tool for inspiration. You are responsible for final outputs, trademarks, and commercial use.</div>
    </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (Platform.OS === "web") {
    window.open(uri, "_blank");
    return "opened";
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
  }
  return "shared";
}
