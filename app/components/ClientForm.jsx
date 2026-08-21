"use client";
import { useActionState, useState } from "react";
import { saveClient } from "@/app/(app)/admin/clients/actions";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm " +
  "focus:border-[var(--accent)] focus:outline-none";
const textareaCls = `${inputCls} min-h-24 font-mono text-xs`;
const labelCls = "block text-xs font-medium text-[var(--text-secondary)]";
const smallBtn =
  "rounded-md border border-[var(--border)] bg-white px-2 py-0.5 text-xs text-[var(--text-secondary)] " +
  "hover:bg-[var(--page)] disabled:opacity-30";

function Section({ title, hint, children }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 49);

// `initial` (edit mode) mirrors the saveClient payload shape.
export default function ClientForm({ initial }) {
  const [state, action, pending] = useActionState(saveClient, null);

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [target, setTarget] = useState(
    initial?.target ?? { name: "", aliases: "", owned_domains: "" });
  const [competitors, setCompetitors] = useState(
    initial?.competitors?.length ? initial.competitors : [{ name: "", aliases: "", owned_domains: "" }]);
  const [ecosystem, setEcosystem] = useState(initial?.ecosystem ?? []);
  const [categories, setCategories] = useState((initial?.categories ?? []).join("\n"));
  const [fallback, setFallback] = useState(initial?.fallback_category ?? "");
  const [rules, setRules] = useState(initial?.rules ?? []);
  const [vocab, setVocab] = useState((initial?.vocab ?? []).join("\n"));
  const [facets, setFacets] = useState(initial?.facets ?? []);
  const [cadence, setCadence] = useState(initial?.tracking_cadence ?? "weekly");
  const [integrations, setIntegrations] = useState(
    initial?.integrations ?? {
      tavily_enabled: false,
      profound_enabled: false,
      profound_org_id: "",
      profound_category: "",
    });

  const catList = categories.split("\n").map((c) => c.trim()).filter(Boolean);

  const updateRow = (setter) => (i, key, value) =>
    setter((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const removeRow = (setter) => (i) => setter((rows) => rows.filter((_, j) => j !== i));
  const moveRule = (i, dir) =>
    setRules((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const payload = JSON.stringify({
    id: initial?.id,
    slug, name, target, competitors, ecosystem,
    categories: catList,
    fallback_category: fallback || catList[0] || "",
    rules, vocab: vocab.split("\n"),
    facets,
    tracking_cadence: cadence,
    integrations,
  });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="payload" value={payload} />

      <Section title="Client">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Client name
            <input
              required value={name} className={inputCls}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </label>
          <label className={labelCls}>
            Slug (URL: /clients/…)
            <input
              required value={slug} className={inputCls}
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
            />
          </label>
          <div className={labelCls}>
            Tracking cadence
            <div className="mt-1 flex rounded-md border border-[var(--border)] bg-white p-0.5" role="radiogroup" aria-label="Tracking cadence">
              {["weekly", "daily"].map((c) => (
                <button
                  key={c} type="button" role="radio" aria-checked={cadence === c}
                  className={`flex-1 rounded px-3 py-1 text-xs font-medium capitalize ${
                    cadence === c
                      ? "bg-[var(--text-primary)] text-white"
                      : "text-[var(--text-secondary)] hover:bg-[var(--page)]"
                  }`}
                  onClick={() => setCadence(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] font-normal text-[var(--text-muted)]">
              How often the scheduler collects data for this client.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Target brand" hint="Aliases: comma-separated surface forms. Owned domains: one per line or comma-separated.">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            Brand name
            <input required value={target.name} className={inputCls}
              onChange={(e) => setTarget({ ...target, name: e.target.value })} />
          </label>
          <label className={labelCls}>
            Aliases
            <input value={target.aliases} className={inputCls} placeholder="POLYWOOD, Poly-Wood"
              onChange={(e) => setTarget({ ...target, aliases: e.target.value })} />
          </label>
          <label className={labelCls}>
            Owned domains
            <input value={target.owned_domains} className={inputCls} placeholder="polywood.com"
              onChange={(e) => setTarget({ ...target, owned_domains: e.target.value })} />
          </label>
        </div>
      </Section>

      <Section title="Competitors" hint="Row order drives chart colors — keep the most important first.">
        {competitors.map((c, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <label className={labelCls}>
                Name
                <input value={c.name} className={inputCls}
                  onChange={(e) => updateRow(setCompetitors)(i, "name", e.target.value)} />
              </label>
              <label className={labelCls}>
                Aliases
                <input value={c.aliases} className={inputCls}
                  onChange={(e) => updateRow(setCompetitors)(i, "aliases", e.target.value)} />
              </label>
              <label className={labelCls}>
                Owned domains
                <input value={c.owned_domains} className={inputCls}
                  onChange={(e) => updateRow(setCompetitors)(i, "owned_domains", e.target.value)} />
              </label>
            </div>
            <button type="button" className={`${smallBtn} mb-0.5`} aria-label="Remove competitor" onClick={() => removeRow(setCompetitors)(i)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={smallBtn}
          onClick={() => setCompetitors((r) => [...r, { name: "", aliases: "", owned_domains: "" }])}>
          + Add competitor
        </button>
      </Section>

      <Section title="Ecosystem orgs" hint="Retailers, marketplaces, suppliers the mention pass should recognize.">
        {ecosystem.map((o, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Name
                <input value={o.name} className={inputCls}
                  onChange={(e) => updateRow(setEcosystem)(i, "name", e.target.value)} />
              </label>
              <label className={labelCls}>
                Aliases
                <input value={o.aliases} className={inputCls}
                  onChange={(e) => updateRow(setEcosystem)(i, "aliases", e.target.value)} />
              </label>
            </div>
            <button type="button" className={`${smallBtn} mb-0.5`} aria-label="Remove org" onClick={() => removeRow(setEcosystem)(i)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={smallBtn}
          onClick={() => setEcosystem((r) => [...r, { name: "", aliases: "" }])}>
          + Add org
        </button>
      </Section>

      <Section title="Service areas / products" hint="Optional second classification axis for Citation Targets — a name plus a regex that matches prompts about it (e.g. 'Dining sets' / dining|table).">
        {facets.map((f, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Name
                <input value={f.name} className={inputCls}
                  onChange={(e) => updateRow(setFacets)(i, "name", e.target.value)} />
              </label>
              <label className={labelCls}>
                Pattern
                <input value={f.pattern} className={`${inputCls} font-mono text-xs`}
                  onChange={(e) => updateRow(setFacets)(i, "pattern", e.target.value)} />
              </label>
            </div>
            <button type="button" className={`${smallBtn} mb-0.5`} aria-label="Remove facet" onClick={() => removeRow(setFacets)(i)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={smallBtn}
          onClick={() => setFacets((r) => [...r, { name: "", pattern: "" }])}>
          + Add service area / product
        </button>
      </Section>

      <Section title="Keyword categories" hint="One per line — the query buckets for Share of Voice by Keywords.">
        <textarea value={categories} className={textareaCls}
          onChange={(e) => setCategories(e.target.value)} />
        <label className={labelCls}>
          Fallback category (assigned when no rule matches)
          <select value={fallback || catList[0] || ""} className={inputCls}
            onChange={(e) => setFallback(e.target.value)}>
            {catList.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </Section>

      <Section
        title="Keyword rules"
        hint="Ordered — the first matching regex categorizes a prompt. The '.*' catch-all (→ fallback) is appended automatically. Patterns run in Python re."
      >
        {rules.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className={`${labelCls} flex-1`}>
              Pattern
              <input value={r.pattern} className={`${inputCls} font-mono text-xs`}
                onChange={(e) => updateRow(setRules)(i, "pattern", e.target.value)} />
            </label>
            <label className={`${labelCls} w-64`}>
              Category
              <select value={r.category} className={inputCls}
                onChange={(e) => updateRow(setRules)(i, "category", e.target.value)}>
                <option value="">—</option>
                {catList.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <div className="mb-0.5 flex gap-1">
              <button type="button" className={smallBtn} aria-label="Move rule up" disabled={i === 0} onClick={() => moveRule(i, -1)}>↑</button>
              <button type="button" className={smallBtn} aria-label="Move rule down" disabled={i === rules.length - 1} onClick={() => moveRule(i, 1)}>↓</button>
              <button type="button" className={smallBtn} aria-label="Remove rule" onClick={() => removeRow(setRules)(i)}>✕</button>
            </div>
          </div>
        ))}
        <button type="button" className={smallBtn}
          onClick={() => setRules((r) => [...r, { pattern: "", category: catList[0] ?? "" }])}>
          + Add rule
        </button>
      </Section>

      <Section title="Key-term vocabulary" hint="One term per line — curated attributes/materials/products for the Key Terms widget.">
        <textarea value={vocab} className={textareaCls}
          onChange={(e) => setVocab(e.target.value)} />
      </Section>

      <Section
        title="Integrations"
        hint="External citation sources for the Emerging tab. API keys are configured in the pipeline environment (TAVILY_API_KEY / PROFOUND_API_KEY)."
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox" checked={integrations.tavily_enabled}
            onChange={(e) => setIntegrations({ ...integrations, tavily_enabled: e.target.checked })}
          />
          Tavily web search on fan-out keywords
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox" checked={integrations.profound_enabled}
            onChange={(e) => setIntegrations({ ...integrations, profound_enabled: e.target.checked })}
          />
          Profound citation reports (client has a Profound subscription)
        </label>
        {integrations.profound_enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Profound category ID (UUID — scopes the citations report)
              <input value={integrations.profound_category} className={`${inputCls} font-mono text-xs`}
                placeholder="182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e"
                onChange={(e) => setIntegrations({ ...integrations, profound_category: e.target.value })} />
            </label>
            <label className={labelCls}>
              Profound organization ID (optional)
              <input value={integrations.profound_org_id} className={`${inputCls} font-mono text-xs`}
                onChange={(e) => setIntegrations({ ...integrations, profound_org_id: e.target.value })} />
            </label>
          </div>
        )}
      </Section>

      {state?.error && <p className="text-sm text-[#e34948]">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : initial ? "Save changes" : "Create client"}
        </button>
        <p className="text-xs text-[var(--text-muted)]">
          Then ingest data: <code className="font-mono">python ingest.py --client {slug || "<slug>"} export.csv</code>
        </p>
      </div>
    </form>
  );
}
