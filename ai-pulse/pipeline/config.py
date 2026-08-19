"""
AI Pulse pipeline configuration.

Target brand, competitor set, ecosystem gazetteer, media/journalist
reference DB, keyword taxonomy, and classification rule tables.
Swap this file out per client — everything else is generic.

NOTE: journalist names in MEDIA_DB below are fictional demo records.
In production this table is populated from a licensed media database
(Muck Rack API, Cision, or a scraped byline index).
"""

DB_DSN = "host=/tmp port=5433 dbname=ai_pulse user=pulse"

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

# Ecosystem orgs the entity pass should recognize (retailers, marketplaces,
# material suppliers, adjacent brands). Extend freely.
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

# ---------------- Media / journalist reference DB ----------------
# outlet -> (domain, domain_authority, outlet_type, [journalists])
MEDIA_DB = {
    "The Spruce":            ("thespruce.com", 92, "lifestyle", ["Camille Deroy", "Nate Willoughby"]),
    "Good Housekeeping":     ("goodhousekeeping.com", 93, "lifestyle", ["Priya Raghunathan"]),
    "Better Homes & Gardens": ("bhg.com", 91, "lifestyle", ["Marcus Ellard"]),
    "Architectural Digest":  ("architecturaldigest.com", 92, "lifestyle", ["Sofia Brantley"]),
    "House Beautiful":       ("housebeautiful.com", 89, "lifestyle", ["Del Okafor"]),
    "Popular Mechanics":     ("popularmechanics.com", 90, "review", ["Reid Castellano"]),
    "Wirecutter (NYT)":      ("nytimes.com", 95, "review", ["June Petrakis"]),
    "Forbes Vetted":         ("forbes.com", 95, "national", ["Anders Lindqvist"]),
    "Business Insider":      ("businessinsider.com", 92, "national", ["Tamsin Oyelaran"]),
    "USA Today Reviewed":    ("usatoday.com", 94, "national", ["Colby Marsh"]),
    "Bob Vila":              ("bobvila.com", 85, "review", ["Renata Kowalczyk"]),
    "The Strategist (NY Mag)": ("nymag.com", 90, "review", ["Ilan Bergstrom"]),
    "Homes & Gardens":       ("homesandgardens.com", 84, "lifestyle", ["Petra Vance"]),
    "Country Living":        ("countryliving.com", 87, "lifestyle", ["Wren Hollis"]),
    "Food & Wine (Outdoor)": ("foodandwine.com", 90, "lifestyle", ["Dario Mancuso"]),
    "Furniture Today":       ("furnituretoday.com", 68, "trade", ["Gil Pemberton"]),
    "Casual Living":         ("casualliving.com", 55, "trade", ["Ana Sorvino"]),
    "Patio & Hearth Products Report": ("patioandhearthproducts.com", 42, "trade", ["Kip Larrabee"]),
}

# Social platforms => media_type 'social'
SOCIAL_DOMAINS = {
    "reddit.com", "youtube.com", "facebook.com", "instagram.com",
    "pinterest.com", "tiktok.com", "x.com", "twitter.com", "quora.com",
}

# Retail / marketplace / review-aggregator domains => media_type 'other'
OTHER_DOMAINS = {
    "amazon.com", "wayfair.com", "costco.com", "homedepot.com",
    "lowes.com", "walmart.com", "target.com", "overstock.com",
    "houzz.com", "trustpilot.com", "consumerreports.org", "etsy.com",
    "westelm.com", "potterybarn.com", "crateandbarrel.com", "frontgate.com",
    "llbean.com", "wikipedia.org",
}

# ---------------- Keyword taxonomy --------------------------------
# Query categories for "Share of Voice by Keywords" (client-supplied).
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

# ---------------- Key-term extraction vocabulary ------------------
# Curated attribute/material/product vocabulary matched with word
# boundaries; supplements the statistical n-gram pass.
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

STOPWORDS = set("""a an and are as at be but by for from has have if in into is it its of on or
such that the their then there these they this to was were will with you your which who whose
what when how why can could should would may might do does did not no yes than more most very
also just about over under between against during before after out up down off above below
""".split())
