/**
 * Renders every email template against the demo data set and writes the
 * results to samples/. Run with: npx tsx scripts/generate-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedData } from "../lib/seed";
import { TEMPLATES, renderEmailHtml, renderPlainText } from "../lib/templates";

const data = seedData();
const outDir = join(process.cwd(), "samples");
mkdirSync(outDir, { recursive: true });

const pick = (id: string) => data.contractors.find((c) => c.id === id) ?? null;

/** A sensible demo subject for each template. */
const SUBJECTS: Record<string, string> = {
  "extension-request": "con_0001",
  "non-extension": "con_0010",
  "po-variation": "con_0006",
  "onboarding-chase": "con_0007",
  "work-rights": "con_0003",
  "tenure-review": "con_0001",
  "msa-renewal": "con_0006",
  "offboarding-internal": "con_0010",
  "rate-challenge": "con_0006",
  welcome: "con_0007",
};

const index: string[] = [];

for (const template of TEMPLATES) {
  const contractor = pick(SUBJECTS[template.id] ?? "con_0001");
  const vendor =
    data.vendors.find((v) => v.id === contractor?.vendorId) ?? data.vendors[0];
  const ctx = {
    data,
    contractor,
    vendor,
    senderName: "Gavin Buchanan",
    senderRole: "Resource Manager",
    senderOrg: data.settings.organisationName,
  };
  const html = renderEmailHtml(template, ctx);
  writeFileSync(join(outDir, `${template.id}.html`), html, "utf8");
  writeFileSync(
    join(outDir, `${template.id}.txt`),
    `Subject: ${template.subject(ctx)}\n\n${renderPlainText(template, ctx)}`,
    "utf8"
  );
  index.push(
    `<li><a href="${template.id}.html">${template.name}</a> <span>${template.blurb}</span></li>`
  );
  console.log(`wrote samples/${template.id}.html`);
}

writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8">
<title>Rostered email templates</title>
<style>
body{margin:0;padding:32px;background:#f2f0fd;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e1b39;}
main{max-width:760px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 10px rgba(46,34,110,.06);}
h1{margin:0 0 6px;font-size:22px;letter-spacing:-.02em;}
p.lead{margin:0 0 22px;color:#5f5c85;font-size:14px;}
ul{list-style:none;margin:0;padding:0;}
li{padding:14px 0;border-bottom:1px solid #ebe8fa;}
li:last-child{border-bottom:0;}
a{color:#5b3ff5;text-decoration:none;font-weight:600;font-size:15px;}
a:hover{text-decoration:underline;}
li span{display:block;color:#5f5c85;font-size:13px;margin-top:3px;}
</style></head><body><main>
<h1>Rostered email templates</h1>
<p class="lead">Rendered against the demo register. Every figure in these comes out of the contractor record, not a placeholder.</p>
<ul>${index.join("")}</ul>
</main></body></html>`,
  "utf8"
);
console.log("wrote samples/index.html");
