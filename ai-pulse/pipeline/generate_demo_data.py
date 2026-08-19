"""
Demo-data generator: produces a realistic raw multi-LLM export CSV
(columns: prompt, vendor, date, response) for the Polywood brand set.

Deterministic (seeded) so runs are reproducible. In production this file
is replaced by real exports from the prompt-runner (OpenAI / Google /
Anthropic APIs queried on a schedule).
"""
import csv, random, hashlib
from datetime import date, timedelta
from pathlib import Path
from media_articles import ARTICLES

OUT = Path(__file__).parent.parent / "data" / "llm_export.csv"

PROMPTS = [p.strip() for p in """
What are the best outdoor furniture brands for a patio that will last 20 years?
Which companies make the highest quality recycled plastic patio furniture?
What outdoor furniture brands are actually made in the USA?
Who makes the best low maintenance patio furniture?
Which outdoor furniture brands offer the longest warranty?
What patio furniture should I buy if I never want to bring it inside for winter?
Who makes all weather patio furniture that does not fade?
What outdoor furniture brands do interior designers recommend most?
What is the best patio furniture for a family with young kids?
Which outdoor furniture brands ship direct to consumers with free delivery?
What are the best outdoor furniture brands for a lake house?
Which patio furniture companies make furniture from recycled ocean plastic?
What is the best outdoor furniture to buy for a brand new deck?
Which brands make patio furniture in bright colors instead of beige and grey?
What are the best outdoor furniture brands for a small balcony or front porch?
Who makes patio furniture that does not need cushions?
What are the best alternatives to POLYWOOD outdoor furniture?
Who are POLYWOOD's main competitors?
POLYWOOD vs Trex Outdoor Furniture: which is better for a coastal home?
Is Berlin Gardens better quality than POLYWOOD?
POLYWOOD vs C.R. Plastic Products: which one lasts longer?
Which poly lumber furniture brand do customers rate highest?
Are the poly Adirondack chairs sold at Costco as good as the premium brands?
How does Loll Designs compare to POLYWOOD for modern outdoor seating?
Is Highwood USA a cheaper alternative to POLYWOOD?
Is POLYWOOD or an Amish made poly furniture maker the better buy?
Are cheap HDPE Adirondack chairs on Amazon as durable as premium brands?
Breezesta vs LuxCraft vs POLYWOOD: which offers the best value?
How does POLYWOOD compare to Yardbird for outdoor lounge furniture?
What is the best Adirondack chair you can buy?
Which Adirondack chairs are actually worth the money?
What are the best recycled plastic Adirondack chairs?
Are POLYWOOD Adirondack chairs worth the price?
How much should I expect to pay for a good Adirondack chair?
Which Adirondack chair is most comfortable for a tall person?
Are folding Adirondack chairs worth it compared to fixed frame ones?
What is the best porch rocking chair that can stay outside year round?
Which outdoor rocking chairs hold up best in direct sun?
How many colors do POLYWOOD Adirondack chairs come in?
What are the best Adirondack chairs to put around a fire pit?
Which Adirondack chairs are easiest for older adults to get out of?
What are the best front porch gliders for two people?
What is the best outdoor dining set that can stay outside all year?
Which outdoor dining tables do not warp, crack or splinter?
How much does a POLYWOOD outdoor dining set cost?
What are the best counter height patio dining sets?
Which outdoor dining chairs are comfortable without cushions?
What is the best patio dining table for a family of six?
Is a teak or a recycled plastic outdoor dining table the better long term buy?
What are the best bar height outdoor tables for entertaining?
Which outdoor dining sets are heavy enough for a windy deck?
What is the best outdoor dining furniture for a covered patio?
Which patio dining sets are easiest to clean after a meal outside?
What is the best outdoor sofa that can be left out in the rain?
Does POLYWOOD make deep seating sofas and how comfortable are they?
Which patio conversation sets are worth buying?
What are the best outdoor chaise lounges for a pool deck?
Which outdoor lounge furniture does not get too hot to sit on in direct sun?
What is the best modular outdoor seating for a large patio?
What outdoor furniture works best around a saltwater or chlorine pool?
Are outdoor swings and daybeds worth the money?
Which patio sectionals hold up best in a rainy climate?
What is the best furniture for a screened in porch?
What is HDPE outdoor furniture and how long does it last?
Is poly lumber furniture better than teak?
Does recycled plastic patio furniture fade in the sun?
What is the difference between poly lumber and composite outdoor furniture?
What outdoor furniture material needs the least maintenance?
What is genuine POLYWOOD lumber made from and how is it different from generic poly?
Will plastic outdoor furniture get brittle or crack over time?
Is aluminum or HDPE the better material for patio furniture?
How heavy is recycled plastic outdoor furniture and will it blow over?
Does poly lumber furniture get hot to sit on in summer?
How can you tell high quality poly lumber furniture from a cheap version?
Is wicker or recycled plastic better for outdoor furniture?
Do you need to cover recycled plastic patio furniture over winter?
Why is recycled plastic patio furniture so expensive?
How much does good quality outdoor furniture cost?
Is expensive patio furniture actually worth it?
Is POLYWOOD worth the price compared to cheaper patio furniture?
When is the best time of year to buy patio furniture on sale?
What outdoor furniture gives the best value over a ten year period?
What outdoor furniture gives the best value over a ten year period for commercial or restaurant patios?
""".strip().split("\n")]

ENGINES = ["chatgpt", "gemini", "claude"]
START = date(2026, 6, 24)
DATES = [START + timedelta(days=4 * i) for i in range(14)]   # ~8 weeks

# Base P(mention) per engine, plus linear trend across the window.
BRAND_MODEL = {
    "POLYWOOD":               {"chatgpt": 0.66, "gemini": 0.50, "claude": 0.60, "trend": 0.14},
    "Trex Outdoor Furniture": {"chatgpt": 0.38, "gemini": 0.36, "claude": 0.33, "trend": 0.00},
    "Highwood USA":           {"chatgpt": 0.30, "gemini": 0.26, "claude": 0.28, "trend": 0.03},
    "Berlin Gardens":         {"chatgpt": 0.20, "gemini": 0.16, "claude": 0.24, "trend": 0.00},
    "Breezesta":              {"chatgpt": 0.16, "gemini": 0.14, "claude": 0.18, "trend": 0.00},
    "C.R. Plastic Products":  {"chatgpt": 0.14, "gemini": 0.15, "claude": 0.13, "trend": 0.00},
    "Loll Designs":           {"chatgpt": 0.15, "gemini": 0.11, "claude": 0.17, "trend": 0.00},
    "LuxCraft":               {"chatgpt": 0.10, "gemini": 0.09, "claude": 0.12, "trend": 0.00},
    "Yardbird":               {"chatgpt": 0.14, "gemini": 0.17, "claude": 0.11, "trend": -0.02},
}
ECOSYSTEM_P = {
    "Costco": 0.11, "Amazon": 0.14, "Wayfair": 0.10, "Home Depot": 0.08,
    "Lowe's": 0.06, "Walmart": 0.04, "West Elm": 0.04, "Pottery Barn": 0.04,
    "Crate & Barrel": 0.04, "Frontgate": 0.03, "L.L.Bean": 0.05, "IKEA": 0.03,
    "Oceanworks": 0.02, "Grandin Road": 0.02,
}

# Sentence pools keyed by sentiment. {b} = brand.
POS = [
    "{b} consistently earns top marks for build quality and its 20-year warranty on residential frames.",
    "{b} is widely praised for genuine HDPE poly lumber that is UV-stabilized and fade-resistant, with marine-grade hardware.",
    "Reviewers highlight {b} as the gold standard for low maintenance, all-weather durability — it can stay outside year round.",
    "{b} stands out for being made in the USA from recycled plastic, including recycled milk jugs and ocean-bound plastic.",
    "Testers found {b} chairs remarkably comfortable even without cushions, and the color selection is excellent.",
    "{b} gets strong customer ratings for weather resistance — no warping, cracking, or splintering after several seasons.",
]
NEU = [
    "{b} offers a broad catalog spanning Adirondack chairs, dining sets, deep seating, and porch gliders.",
    "{b} ships direct to consumers and is also stocked by major retailers.",
    "{b} sits in the mid-to-premium price tier for the poly lumber category.",
    "{b} uses HDPE poly lumber construction similar to other brands in this space.",
]
NEG = [
    "The main criticism of {b} is price — sets cost noticeably more than big-box alternatives.",
    "Some buyers note {b} pieces are heavy to move, and darker colors can get hot to sit on in direct summer sun.",
    "A few reviews mention slow delivery windows for {b} during peak season.",
    "{b} has drawn some complaints about comfort on longer sits without added cushions.",
]
# Per-brand sentiment mix (P positive, P neutral, P negative)
SENT_MIX = {
    "POLYWOOD": (0.62, 0.28, 0.10),
    "Trex Outdoor Furniture": (0.45, 0.40, 0.15),
    "Highwood USA": (0.45, 0.42, 0.13),
    "Berlin Gardens": (0.50, 0.40, 0.10),
    "Breezesta": (0.40, 0.48, 0.12),
    "C.R. Plastic Products": (0.38, 0.50, 0.12),
    "Loll Designs": (0.48, 0.42, 0.10),
    "LuxCraft": (0.35, 0.52, 0.13),
    "Yardbird": (0.42, 0.38, 0.20),
}

OWNED_URLS = [
    "https://www.polywood.com/adirondack-chairs/",
    "https://www.polywood.com/shop/dining-sets/",
    "https://www.polywood.com/modern-adirondack-chair/",
    "https://www.polywood.com/blog/hdpe-vs-teak/",
    "https://www.polywood.com/blog/what-is-polywood-lumber/",
    "https://www.polywood.com/warranty/",
    "https://www.polywood.com/deep-seating/",
    "https://www.polywood.com/rocking-chairs/",
]
COMPETITOR_OWNED = [
    "https://www.trexfurniture.com/adirondack-chairs/",
    "https://www.highwood-usa.com/collections/adirondack/",
    "https://lolldesigns.com/collections/adirondack-chairs",
    "https://yardbird.com/outdoor-furniture/",
    "https://www.breezesta.com/products/",
]
SOCIAL_URLS = [
    "https://www.reddit.com/r/BuyItForLife/comments/1f8x2q/polywood_after_5_years/",
    "https://www.reddit.com/r/Decks/comments/1dk93p/best_furniture_for_new_deck/",
    "https://www.reddit.com/r/landscaping/comments/1hm22a/adirondack_chair_recommendations/",
    "https://www.youtube.com/watch?v=poly4wood20yr",
    "https://www.youtube.com/watch?v=adk5chairtest",
    "https://www.pinterest.com/pin/outdoor-patio-polywood-ideas/",
    "https://www.quora.com/Is-POLYWOOD-furniture-worth-the-price",
]
OTHER_URLS = [
    "https://www.amazon.com/dp/B08XYZPOLY1",
    "https://www.amazon.com/dp/B07ADKCHAIR",
    "https://www.wayfair.com/outdoor/pdp/polywood-classic-adirondack.html",
    "https://www.costco.com/poly-adirondack-chair.product.100812345.html",
    "https://www.homedepot.com/p/POLYWOOD-Classic-Adirondack/312456789",
    "https://www.lowes.com/pd/Trex-Outdoor-Furniture-Cape-Cod/1000234567",
    "https://www.houzz.com/products/recycled-plastic-outdoor-furniture",
    "https://www.consumerreports.org/outdoor-furniture/buying-guide/",
    "https://en.wikipedia.org/wiki/High-density_polyethylene",
]
EARNED_URLS = [f"https://www.{d}{p}" for (d, p) in ARTICLES.keys()]

INTROS = [
    "Here are the brands and options that come up most often for this:",
    "Several brands stand out in this category:",
    "Based on recent reviews and expert testing, here is what to consider:",
    "Great question — durability and material matter most here.",
]
MATERIAL_FACTS = [
    "HDPE (high-density polyethylene) poly lumber is the leading low maintenance material: it will not warp, crack, or splinter, and it never needs painting or sealing.",
    "Genuine poly lumber is UV-stabilized so colors stay fade-resistant for years, unlike cheap resin furniture that gets brittle.",
    "Recycled plastic furniture is heavy enough for windy decks and can be left outside all year, even through snow and coastal salt air.",
    "Teak weathers beautifully but demands oiling; aluminum is lighter but dents; wicker needs cover — HDPE wins on maintenance.",
]

def rng_for(prompt, engine, d):
    seed = int(hashlib.md5(f"{prompt}|{engine}|{d}".encode()).hexdigest()[:8], 16)
    return random.Random(seed)

def pick_sentence(rng, brand):
    p_pos, p_neu, _ = SENT_MIX[brand]
    r = rng.random()
    pool = POS if r < p_pos else NEU if r < p_pos + p_neu else NEG
    return rng.choice(pool).format(b=brand)

def gen_response(prompt, engine, d, day_frac):
    rng = rng_for(prompt, engine, d)
    pl = prompt.lower()
    mentioned = []
    for brand, m in BRAND_MODEL.items():
        p = m[engine] + m["trend"] * day_frac
        if any(a.lower() in pl for a in ([brand] + (["polywood"] if brand == "POLYWOOD" else [brand.split()[0]]))):
            p = 0.97
        if rng.random() < p:
            mentioned.append(brand)
    ecosystem = [o for o, p in ECOSYSTEM_P.items() if rng.random() < p]

    parts = [rng.choice(INTROS)]
    if any(w in pl for w in ("hdpe", "material", "poly lumber", "teak", "fade", "recycled", "maintenance")):
        parts.append(rng.choice(MATERIAL_FACTS))
    for brand in mentioned:
        parts.append(pick_sentence(rng, brand))
        if rng.random() < 0.35:
            parts.append(pick_sentence(rng, brand))
    if ecosystem:
        parts.append("Retail availability: you can also find options at " + ", ".join(ecosystem) + ".")
    if not mentioned:
        parts.append("Look for genuine HDPE poly lumber, stainless steel hardware, and a warranty of at least 20 years when comparing brands.")

    n_cites = rng.randint(2, 6)
    pool = (EARNED_URLS * 5) + (OWNED_URLS * (3 if "POLYWOOD" in mentioned else 1)) \
         + (COMPETITOR_OWNED * 1) + (SOCIAL_URLS * 2) + (OTHER_URLS * 2)
    cites = []
    for u in rng.sample(pool, k=min(n_cites * 3, len(pool))):
        if u not in cites:
            cites.append(u)
        if len(cites) == n_cites:
            break

    body = " ".join(parts)
    if engine == "chatgpt":
        cite_block = "\n\nSources:\n" + "\n".join(f"- [{u.split('/')[2]}]({u})" for u in cites)
    elif engine == "gemini":
        cite_block = "\n\nCited pages:\n" + "\n".join(cites)
    else:
        cite_block = "\n\nSources consulted:\n" + "\n".join(f"[{i+1}] {u}" for i, u in enumerate(cites))
    return body + cite_block

def main():
    OUT.parent.mkdir(exist_ok=True)
    n = 0
    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["prompt", "vendor", "date", "response"])
        for d_i, d in enumerate(DATES):
            day_frac = d_i / (len(DATES) - 1)
            for prompt in PROMPTS:
                for engine in ENGINES:
                    w.writerow([prompt, engine, d.isoformat(),
                                gen_response(prompt, engine, d, day_frac)])
                    n += 1
    print(f"wrote {n} rows -> {OUT}")

if __name__ == "__main__":
    main()
