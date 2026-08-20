import * as Q from "./queries";
import { assignBrandColors } from "./palette";

// The full dashboard report — single source for both the page and
// /api/dashboard. `client` is a row from getClientBySlug().
export async function getReport({ client, engine, range }) {
  const f = { clientId: client.id, engine, range };
  const brand = client.target_brand;

  const [kpis, matrix, trend, media, sov, keywordSov, sentiment, terms, orgs,
         domains, ownedUrls, outlets, journalists, mediaListSummary, tracked,
         bounds] =
    await Promise.all([
      Q.kpis(f, brand),
      Q.visibilityMatrix(f),
      Q.visibilityTrend(f, brand),
      Q.mediaStrategy(f),
      Q.shareOfVoice(f),
      Q.keywordShareOfVoice(f, brand),
      Q.sentimentOverTime(f, brand),
      Q.topKeyTerms(f),
      Q.orgMentions(f),
      Q.topDomains(f),
      Q.topOwnedUrls(f, brand),
      Q.topOutlets(f),
      Q.topJournalists(f),
      Q.mediaListSummary(client.id),
      Q.trackedBrands(client.id),
      Q.runDateBounds(client.id),
    ]);

  return {
    brand, kpis, matrix, trend, media, sov, keywordSov, sentiment, terms,
    orgs, domains, ownedUrls, outlets, journalists, mediaListSummary, bounds,
    brandColors: assignBrandColors(tracked),
  };
}
