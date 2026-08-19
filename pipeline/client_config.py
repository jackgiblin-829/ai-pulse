"""
Per-client pipeline configuration, loaded from Postgres.

The clients / brands / keyword_categories / keyword_rules /
key_term_vocab tables are the source of truth (written by the
/admin/clients onboarding form or seed_client.py). This module reads
them into a ClientConfig with the derived lookups the ingest pipeline
needs (owned-domain map, alias regexes, brand-word set).
"""
import re
import sys
from dataclasses import dataclass, field


def alias_regex(aliases: list) -> re.Pattern:
    alts = sorted((re.escape(a) for a in aliases), key=len, reverse=True)
    return re.compile(r"(?<![\w&])(" + "|".join(alts) + r")(?![\w])", re.IGNORECASE)


@dataclass
class ClientConfig:
    client_id: int
    slug: str
    name: str
    target_brand: str
    # brand name -> {id, role, aliases, owned}
    brands: dict
    # keyword category name -> id
    keyword_categories: dict
    # ordered (compiled pattern, keyword_category_id)
    keyword_rules: list
    key_term_vocab: list
    # ordered (compiled pattern, facet_id) — service areas / product lines
    facet_rules: list = field(default_factory=list)
    # derived
    owned_lookup: dict = field(default_factory=dict)     # domain -> brand name
    brand_regexes: dict = field(default_factory=dict)    # brand name -> compiled alias regex
    brand_words: set = field(default_factory=set)
    fallback_category_id: int = 0

    def keyword_for_prompt(self, prompt: str) -> int:
        pl = prompt.lower()
        for pattern, cat_id in self.keyword_rules:
            if pattern.search(pl):
                return cat_id
        return self.fallback_category_id

    def facet_for_prompt(self, prompt: str):
        pl = prompt.lower()
        for pattern, facet_id in self.facet_rules:
            if pattern.search(pl):
                return facet_id
        return None


def load_client(cur, slug: str) -> ClientConfig:
    cur.execute("SELECT id, slug, name FROM clients WHERE slug = %s", (slug,))
    row = cur.fetchone()
    if not row:
        cur.execute("SELECT slug FROM clients ORDER BY slug")
        known = ", ".join(s for (s,) in cur.fetchall()) or "(none — run seed_client.py first)"
        sys.exit(f"Unknown client slug '{slug}'. Known clients: {known}")
    client_id, slug, name = row

    cur.execute(
        "SELECT id, name, role, aliases, owned_domains FROM brands WHERE client_id = %s",
        (client_id,))
    brands = {n: {"id": i, "role": r, "aliases": a, "owned": od}
              for i, n, r, a, od in cur.fetchall()}
    target = next((n for n, b in brands.items() if b["role"] == "target"), None)
    if not target:
        sys.exit(f"Client '{slug}' has no target brand configured.")

    cur.execute("SELECT id, name FROM keyword_categories WHERE client_id = %s", (client_id,))
    kw_ids = {n: i for i, n in cur.fetchall()}

    cur.execute(
        """SELECT pattern, keyword_category_id FROM keyword_rules
           WHERE client_id = %s ORDER BY position""", (client_id,))
    rules = [(re.compile(p), cid) for p, cid in cur.fetchall()]
    if not rules:
        sys.exit(f"Client '{slug}' has no keyword rules configured.")
    fallback = rules[-1][1]  # last rule is the '.*' catch-all by convention

    cur.execute("SELECT term FROM key_term_vocab WHERE client_id = %s", (client_id,))
    vocab = [t for (t,) in cur.fetchall()]

    cur.execute(
        "SELECT pattern, id FROM facets WHERE client_id = %s ORDER BY position, id",
        (client_id,))
    facet_rules = [(re.compile(p, re.IGNORECASE), fid) for p, fid in cur.fetchall()]

    cfg = ClientConfig(
        client_id=client_id, slug=slug, name=name, target_brand=target,
        brands=brands, keyword_categories=kw_ids, keyword_rules=rules,
        key_term_vocab=vocab, facet_rules=facet_rules,
        fallback_category_id=fallback,
    )
    for bname, b in brands.items():
        for d in (b["owned"] or []):
            cfg.owned_lookup[d] = bname
        cfg.brand_regexes[bname] = alias_regex(b["aliases"] or [bname])
        for a in (b["aliases"] or [bname]):
            for w in re.split(r"[\s.\-]+", a):
                if len(w) > 2:
                    cfg.brand_words.add(w.lower())
    return cfg
