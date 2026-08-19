import { NextResponse } from "next/server";
import * as Q from "@/lib/queries";

// Full report as JSON — programmatic access to every widget's data.
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const engine = ["all", "chatgpt", "gemini", "claude"].includes(sp.get("engine"))
    ? sp.get("engine") : "all";
  const days = ["30", "60", "90", "all"].includes(sp.get("days")) ? sp.get("days") : "90";
  const brand = Q.TARGET;

  const [kpis, matrix, trend, media, sov, keywordSov, sentiment, terms, orgs, domains, ownedUrls, outlets, journalists] =
    await Promise.all([
      Q.kpis(days, brand),
      Q.visibilityMatrix(days),
      Q.visibilityTrend(days, brand),
      Q.mediaStrategy(days, engine),
      Q.shareOfVoice(days, engine),
      Q.keywordShareOfVoice(days, engine, brand),
      Q.sentimentOverTime(days, engine, brand),
      Q.topKeyTerms(days, engine),
      Q.orgMentions(days, engine),
      Q.topDomains(days, engine),
      Q.topOwnedUrls(days, engine, brand),
      Q.topOutlets(days, engine),
      Q.topJournalists(days, engine),
    ]);

  return NextResponse.json({
    brand, engine, days, kpis, matrix, trend, media, sov,
    keywordSov, sentiment, terms, orgs, domains, ownedUrls, outlets, journalists,
  });
}
