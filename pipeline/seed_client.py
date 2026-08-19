"""
Seed a client's configuration into Postgres.

Usage:
    python3 seed_client.py --slug polywood --name POLYWOOD [--seed-outlets]

Ships with the POLYWOOD demo configuration inline (moved verbatim from
the retired config.py). Onboarding real clients happens through the
dashboard's /admin/clients form; this script exists to rebuild the demo
and as a reference for the config shape.

--seed-outlets also seeds the global media_outlets reference table
(outlet name, domain, DA, type — no journalists; enrich_bylines.py owns
journalist records now).

Idempotent: ON CONFLICT upserts throughout.
"""
import argparse

import psycopg2

import config

# ---------------- POLYWOOD demo configuration ---------------------

TARGET_BRAND = "POLYWOOD"

# name -> {role, aliases, owned_domains}
BRANDS = {
    "POLYWOOD":               {"role": "target",     "aliases": ["POLYWOOD", "Polywood", "Poly-Wood"], "owned_domains": ["polywood.com"]},
    "Trex Outdoor Furniture": {"role": "competitor", "aliases": ["Trex Outdoor Furniture", "Trex"], "owned_domains": ["trexfurniture.com"]},
    "Highwood USA":           {"role": "competitor", "aliases": ["Highwood USA", "Highwood"], "owned_domains": ["highwood-usa.com"]},
    "Berlin Gardens":         {"role": "competitor", "aliases": ["Berlin Gardens"], "owned_domains": ["berlingardens.com"]},
    "Breezesta":              {"role": "competitor", "aliases": ["Breezesta"], "owned_domains": ["breezesta.com"]},
    "C.R. Plastic Products":  {"role": "competitor", "aliases": ["C.R. Plastic Products", "CR Plastics", "C.R. Plastics"], "owned_domains": ["crpproducts.com"]},
    "Loll Designs":           {"role": "competitor", "aliases": ["Loll Designs", "Loll"], "owned_domains": ["lolldesigns.com"]},
    "LuxCraft":               {"role": "competitor", "aliases": ["LuxCraft"], "owned_domains": ["luxcraft.com"]},
    "Yardbird":               {"role": "competitor", "aliases": ["Yardbird"], "owned_domains": ["yardbird.com"]},
}

ECOSYSTEM_ORGS = {
    "Costco":        ["Costco"],
    "Amazon":        ["Amazon"],
    "Wayfair":       ["Wayfair"],
    "The Home Depot": ["Home Depot", "The Home Depot"],
    "Lowe's":        ["Lowe's", "Lowes"],
    "Walmart":       ["Walmart"],
    "Target":        ["Target Corporation"],  # avoid bare "Target" false positives
    "West Elm":      ["West Elm"],
    "Pottery Barn":  ["Pottery Barn"],
    "Crate & Barrel": ["Crate & Barrel", "Crate and Barrel"],
    "Frontgate":     ["Frontgate"],
    "L.L.Bean":      ["L.L.Bean", "LL Bean", "L.L. Bean"],
    "IKEA":          ["IKEA"],
    "Article":       ["Article.com"],
    "Grandin Road":  ["Grandin Road"],
    "Oceanworks":    ["Oceanworks"],          # recycled ocean-plastic supplier
    "Envision Plastics": ["Envision Plastics"],
}

KEYWORDS = [
    "recycled plastic outdoor furniture",
    "polywood furniture",
    "HDPE outdoor furniture",
    "best outdoor furniture brands",
    "recycled plastic Adirondack chairs",
    "all weather patio furniture",
    "outdoor furniture made in USA",
    "low maintenance patio furniture",
    "outdoor dining sets",
    "commercial outdoor furniture",
]

# Ordered rules: first regex match assigns the prompt's keyword category.
# The final '.*' rule is the required catch-all.
KEYWORD_RULES = [
    (r"adirondack|rocking chair|rocker|glider|fire pit", "recycled plastic Adirondack chairs"),
    (r"polywood", "polywood furniture"),
    (r"hdpe|poly lumber|composite", "HDPE outdoor furniture"),
    (r"recycled (plastic|ocean)|ocean plastic", "recycled plastic outdoor furniture"),
    (r"dining|table|bar height|counter height", "outdoor dining sets"),
    (r"made in the usa|american.made", "outdoor furniture made in USA"),
    (r"low maintenance|never want to bring|stay(s)? outside|left out|all year|year round|easiest to clean|cover .* winter", "low maintenance patio furniture"),
    (r"all.weather|fade|rain|windy|coastal|salt|sun|weather|winter|hot to sit", "all weather patio furniture"),
    (r"commercial|restaurant|hotel|hospitality", "commercial outdoor furniture"),
    (r".*", "best outdoor furniture brands"),
]

KEY_TERM_VOCAB = [
    "HDPE", "poly lumber", "recycled plastic", "recycled milk jugs",
    "ocean-bound plastic", "marine-grade hardware", "stainless steel hardware",
    "UV-stabilized", "fade-resistant", "weather-resistant", "all-weather",
    "low maintenance", "maintenance-free", "20-year warranty", "lifetime warranty",
    "Adirondack chair", "rocking chair", "porch glider", "dining set",
    "conversation set", "chaise lounge", "deep seating", "sectional",
    "made in the USA", "Amish-made", "teak", "aluminum", "wicker", "eucalyptus",
    "powder-coated", "mortise-and-tenon", "sustainability", "curbside delivery",
    "white glove delivery", "folding design", "counter height", "bar height",
]

# Service-area / product facets: ordered (name, pattern) — the second
# prompt-classification axis for the Citation Targets view.
FACETS = [
    ("Adirondack & rockers", r"adirondack|rocking chair|rocker|glider"),
    ("Dining sets",          r"dining|table|bar height|counter height"),
    ("Lounge & deep seating", r"chaise|lounge|deep seating|sectional|conversation set"),
    ("Fire pit sets",        r"fire pit"),
    ("Commercial & hospitality", r"commercial|restaurant|hotel|hospitality"),
]

# outlet -> (domain, domain_authority, outlet_type) — global reference data.
MEDIA_OUTLETS = {
    "The Spruce":            ("thespruce.com", 92, "lifestyle"),
    "Good Housekeeping":     ("goodhousekeeping.com", 93, "lifestyle"),
    "Better Homes & Gardens": ("bhg.com", 91, "lifestyle"),
    "Architectural Digest":  ("architecturaldigest.com", 92, "lifestyle"),
    "House Beautiful":       ("housebeautiful.com", 89, "lifestyle"),
    "Popular Mechanics":     ("popularmechanics.com", 90, "review"),
    "Wirecutter (NYT)":      ("nytimes.com", 95, "review"),
    "Forbes Vetted":         ("forbes.com", 95, "national"),
    "Business Insider":      ("businessinsider.com", 92, "national"),
    "USA Today Reviewed":    ("usatoday.com", 94, "national"),
    "Bob Vila":              ("bobvila.com", 85, "review"),
    "The Strategist (NY Mag)": ("nymag.com", 90, "review"),
    "Homes & Gardens":       ("homesandgardens.com", 84, "lifestyle"),
    "Country Living":        ("countryliving.com", 87, "lifestyle"),
    "Food & Wine (Outdoor)": ("foodandwine.com", 90, "lifestyle"),
    "Furniture Today":       ("furnituretoday.com", 68, "trade"),
    "Casual Living":         ("casualliving.com", 55, "trade"),
    "Patio & Hearth Products Report": ("patioandhearthproducts.com", 42, "trade"),
}


def seed_client(cur, slug: str, name: str):
    cur.execute(
        """INSERT INTO clients(slug, name) VALUES (%s,%s)
           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, updated_at=now()
           RETURNING id""", (slug, name))
    client_id = cur.fetchone()[0]

    for kw in KEYWORDS:
        cur.execute(
            """INSERT INTO keyword_categories(client_id, name) VALUES (%s,%s)
               ON CONFLICT (client_id, name) DO NOTHING""", (client_id, kw))
    cur.execute("SELECT id, name FROM keyword_categories WHERE client_id=%s", (client_id,))
    kw_ids = {n: i for i, n in cur.fetchall()}

    cur.execute("DELETE FROM keyword_rules WHERE client_id=%s", (client_id,))
    for pos, (pattern, kw) in enumerate(KEYWORD_RULES):
        cur.execute(
            """INSERT INTO keyword_rules(client_id, position, pattern, keyword_category_id)
               VALUES (%s,%s,%s,%s)""", (client_id, pos, pattern, kw_ids[kw]))

    sort = 0
    for bname, meta in BRANDS.items():
        cur.execute(
            """INSERT INTO brands(client_id, name, role, aliases, owned_domains, sort_order)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (client_id, name) DO UPDATE SET role=EXCLUDED.role,
                 aliases=EXCLUDED.aliases, owned_domains=EXCLUDED.owned_domains,
                 sort_order=EXCLUDED.sort_order""",
            (client_id, bname, meta["role"], meta["aliases"], meta["owned_domains"], sort))
        sort += 1
    for bname, aliases in ECOSYSTEM_ORGS.items():
        cur.execute(
            """INSERT INTO brands(client_id, name, role, aliases) VALUES (%s,%s,'ecosystem',%s)
               ON CONFLICT (client_id, name) DO NOTHING""", (client_id, bname, aliases))

    cur.execute("DELETE FROM key_term_vocab WHERE client_id=%s", (client_id,))
    for term in KEY_TERM_VOCAB:
        cur.execute(
            "INSERT INTO key_term_vocab(client_id, term) VALUES (%s,%s)", (client_id, term))

    for pos, (fname, pattern) in enumerate(FACETS):
        cur.execute(
            """INSERT INTO facets(client_id, name, pattern, position) VALUES (%s,%s,%s,%s)
               ON CONFLICT (client_id, name) DO UPDATE SET pattern=EXCLUDED.pattern,
                 position=EXCLUDED.position""",
            (client_id, fname, pattern, pos))

    return client_id


def seed_outlets(cur):
    for outlet, (domain, da, otype) in MEDIA_OUTLETS.items():
        cur.execute(
            """INSERT INTO media_outlets(name, domain, domain_authority, outlet_type)
               VALUES (%s,%s,%s,%s) ON CONFLICT (domain) DO UPDATE
               SET domain_authority=EXCLUDED.domain_authority""",
            (outlet, domain, da, otype))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--slug", default="polywood")
    ap.add_argument("--name", default="POLYWOOD")
    ap.add_argument("--seed-outlets", action="store_true",
                    help="also seed the global media_outlets reference table")
    args = ap.parse_args()

    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()
    cid = seed_client(cur, args.slug, args.name)
    if args.seed_outlets:
        seed_outlets(cur)
    conn.commit()
    conn.close()
    print(f"Seeded client '{args.slug}' (id={cid})"
          + (" + media outlets" if args.seed_outlets else ""))
