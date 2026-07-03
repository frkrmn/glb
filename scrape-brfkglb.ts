import * as fs from "fs";
import * as path from "path";
import { connect } from "puppeteer-real-browser";
import isCI from "is-ci";
import dotenv from "dotenv";

if (!isCI) {
  dotenv.config({ path: ".env.local" });
}

const BASE_URL = "https://amsflow.com/data-reports/sentiment";

const MARKETS = [
  { key: "us",         label: "US Market",   slug: "us" },
  { key: "eu",         label: "EU Market",   slug: "eu" },
  { key: "uk",         label: "UK Market",   slug: "uk" },
  { key: "japan",      label: "Japan",       slug: "japan" },
  { key: "china",      label: "China",       slug: "china" },
  { key: "australia",  label: "Australia",   slug: "australia" },
  { key: "canada",     label: "Canada",      slug: "canada" },
  { key: "gold",       label: "Gold",        slug: "gold" },
  { key: "silver",     label: "Silver",      slug: "silver" },
  { key: "southkorea", label: "South Korea", slug: "southkorea" },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractHistorical(text: string, keyword: string) {
  const re = new RegExp(keyword + "[\\s\\n]+([\\w ]+?)\\s*[–\\-]\\s*(\\d+)");
  const m = text.match(re);
  if (m) return { score: parseInt(m[2], 10), classification: m[1].trim() };
  return { score: null, classification: "unknown" };
}

function extractYearly(text: string, keyword: string) {
  const re = new RegExp(
    keyword + "[\\s\\n]+([A-Za-z]+ \\d+, \\d{4})[\\s\\n]+([\\w ]+?)\\s*[–\\-]\\s*(\\d+)"
  );
  const m = text.match(re);
  if (m) return { date: m[1].trim(), classification: m[2].trim(), score: parseInt(m[3], 10) };
  return { date: "unknown", classification: "unknown", score: null };
}

function extractHistory(text: string) {
  const history: { date: string; score: number | null; classification: string; assetPrice: string }[] = [];
  const tableSection = text.match(/Date\s+Fear & Greed\s+Classification[\s\S]+?(?=Track Global|$)/);
  if (!tableSection) return history;
  const rowRegex = /([A-Za-z]+ \d+, \d{4})\s+(\d+)\s+([\w ]+?)\s*[–\-]\s*\d+\s+([\d,]+)/g;
  let m;
  while ((m = rowRegex.exec(tableSection[0])) !== null) {
    history.push({
      date: m[1].trim(),
      score: parseInt(m[2], 10),
      classification: m[3].trim(),
      assetPrice: m[4].trim(),
    });
  }
  return history;
}

async function run() {
  const { browser } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  });

  const results = [];

  try {
    for (const market of MARKETS) {
      console.log(`\n→ ${market.label}`);
      const page = await browser.newPage();

      try {
        // Cache'i tamamen kapat
        await page.setCacheEnabled(false);

        await page.goto(`${BASE_URL}/${market.slug}`, {
          waitUntil: "networkidle2",
        });
        await delay(5000);

        // Skoru dogrudan aktif sidebar elementinden al (en guvenilir)
        const sidebarData = await page.evaluate((targetLabel) => {
          const links = document.querySelectorAll("a.block.p-2.rounded-lg");
          for (const link of links) {
            const spans = link.querySelectorAll("span");
            if (spans.length < 3) continue;
            const lbl   = spans[0].textContent?.trim() ?? "";
            const score = spans[1].textContent?.trim() ?? "";
            const cls   = spans[2].textContent?.trim() ?? "";
            if (lbl === targetLabel) {
              return { score: parseInt(score, 10), classification: cls };
            }
          }
          return null;
        }, market.label);

        console.log(`  sidebar data:`, sidebarData);

        const text: string = await page.evaluate(() => document.body.innerText);

        const score          = sidebarData?.score ?? null;
        const classification = sidebarData?.classification ?? "unknown";

        const historical = {
          yesterday: extractHistorical(text, "Yesterday"),
          lastWeek:  extractHistorical(text, "Last\\s+Week"),
          lastMonth: extractHistorical(text, "Last\\s+Month"),
        };

        const yearlyHigh = extractYearly(text, "Yearly\\s+High");
        const yearlyLow  = extractYearly(text, "Yearly\\s+Low");
        const history    = extractHistory(text);

        console.log(`  ✓ score=${score}, class=${classification}, rows=${history.length}`);

        results.push({
          key: market.key, label: market.label,
          score, classification, historical, yearlyHigh, yearlyLow, history,
        });

      } catch (err) {
        console.error(`  ✗ Failed:`, err);
        results.push({
          key: market.key, label: market.label, score: null,
          classification: "unknown",
          historical: {
            yesterday: { score: null, classification: "unknown" },
            lastWeek:  { score: null, classification: "unknown" },
            lastMonth: { score: null, classification: "unknown" },
          },
          yearlyHigh: { date: "unknown", score: null, classification: "unknown" },
          yearlyLow:  { date: "unknown", score: null, classification: "unknown" },
          history: [],
        });
      } finally {
        await page.close();
        await delay(2000);
      }
    }
  } finally {
    await browser.close();
  }

  const output = { markets: results, lastUpdated: new Date().toISOString() };
  const apiDir = path.join(process.cwd(), "public", "api");
  if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
  fs.writeFileSync(path.join(apiDir, "amsflow.json"), JSON.stringify(output, null, 2), "utf-8");
  console.log("\n✓ Saved to public/api/amsflow.json");
}

run().catch(console.error);
