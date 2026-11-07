#!/usr/bin/env python3
"""Deterministic checks of the public page against the design spec.

Standard library only. Exit 0 when every check passes, 1 otherwise, printing one
``FAIL: ...`` line per failure. Private terms can be supplied from a file kept
outside the repository with ``--forbidden-file``.
"""

import argparse
import importlib.util
import json
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
LLMS = ROOT / "llms.txt"
DIST = ROOT / "dist"
MAILTO = "mailto:me@alexkonyakhin.com"
TELEGRAM = "https://t.me/pieceofwave"
BOOKING = "https://calendar.app.google/ats6knZjWvwpJUbp9"

REQUIRED_HTML = [
    # Task 3: header and first screen (spec §3.1–3.2)
    "Fractional CPO · Belgrade",
    "Fractional CPO for founder-led software companies.",
    "I take ownership of product direction, priorities and delivery alongside your existing team, "
    "so the important work moves without every decision coming back to you.",
    "For companies with paying customers and an in-house development team. "
    "EU and UK first; US East Coast mornings work too.",
    "Based in Belgrade, Serbia · Central European Time",
    "Working languages: English and Serbian",
    "Invoicing in EUR from a registered business in Serbia",
    "Product and engineering since 2013",
    "Book a 30-minute call",
    "See the work",
    # Task 4: proof band (spec §3.3)
    "300k+ monthly active users", "employee app I owned as head of product",
    "3× monthly turnover", "mobile printing network, April 2024 to June 2026",
    "20,000 job applications", "first three months of a recruitment journey I led",
    "3 companies co-founded", "2015 to 2022",
    # Task 5: work section (spec §3.4)
    "Employee app for a major retail chain",
    "Head of product for the whole app · Retail · Russia",
    "I owned the product: direction, priorities, research, delivery and measurement. "
    "I led developers, a designer and QA, and brought hypotheses and decisions to senior stakeholders.",
    "Monthly active users", "300k+", "during my time on the product",
    "Job applications", "20,000", "first three months of the recruitment journey",
    "Analytics from events to decisions.",
    "I led the team's implementation of the full stack: event coverage in Firebase, a pipeline into BigQuery, "
    "and custom Looker dashboards that gave senior managers visibility into how the workforce used the app.",
    "A recruitment journey.",
    "We opened the app to people who were not yet employees, so candidates for cashier and store roles could apply directly.",
    "A learning game.",
    "An employee's idea that I shaped into an in-app game on existing training content and piloted across 16 operational clusters.",
    "Copix, mobile printing network",
    "Product work with the founding team · Russia · 2024 to 2026",
    "I worked with the team on the mobile customer journey, refunds for failed prints and the feedback loop from support back into product.",
    "Monthly card turnover", "3×", "April 2024 to June 2026",
    "Turnover per active printer", "2.15×",
    "Network-wide results during the collaboration, alongside pricing and network changes.",
    # Task 6: situations and How I work (spec §3.5–3.6)
    "When founders call me",
    "The team ships, but the business priority keeps slipping.",
    "One initiative crosses product, engineering and operations with no owner.",
    "Too many decisions still come back to you.",
    "How I work",
    "A paid first month.",
    "We agree the business problem, look at the evidence you already have, and set one priority with clear owners "
    "and a practical plan. Scope follows the access, people and budget you can actually give it.",
    "Then month by month.",
    "If it fits, I continue as your fractional CPO: product direction, trade-offs, dependencies across product, "
    "engineering and operations, and keeping the work tied to the goal we agreed. Days per week and scope are agreed individually.",
    "Checkpoints, not lock-in.",
    "Baseline and success criteria are set up front. At each review we continue, adjust the scope, or finish with a clean handover.",
    "Who does what",
    "I own product direction, priorities, trade-offs, stakeholder alignment and measurement. You own the business goal, "
    "budget, access and decision authority. Your CTO and team own technical quality, estimates and day-to-day execution.",
    "Not included: unlimited development, round-the-clock availability, an agency team behind me, or guaranteed results.",
    # Task 7: background timeline and own products (spec §3.7); each row checked as "years role"
    "Background",
    "2025 – now CPO, commercial real-estate platform",
    "2024 – 2026 Product work with Copix, mobile printing network",
    "2023 – now COO and product lead, Erasoft.io, the team behind the retail employee app",
    "2022 Senior Project Manager, Improvado, international team",
    "2020 – 2022 Founder, LTVCAC.agency, performance marketing and JTBD research",
    "2017 – 2019 Co-founder, Togezzer, internal comms for distributed teams",
    "2015 – 2017 Co-founder, Knedlik Tech, travel mobile app",
    "2013 – 2015 PM and tech lead, Globus, mobile and web portfolio",
    "I also build my own products.",
    "NicePass", "Stopwell", "VPNKill",
    # Task 8: contact and footer (spec §3.8–3.9)
    "Let's talk about your product.",
    "Tell me about your product, the team you have and what is not moving. I will tell you honestly whether I can help.",
    "Message me on Telegram", "Email me", "me@alexkonyakhin.com",
    "Alexey Konyakhin · Belgrade",
    "LinkedIn", "Telegram",
]
REQUIRED_LLMS = [
    "Fractional CPO", "Belgrade", "English and Serbian", "300,000", "20,000", "3 times", "2.15",
    "April 2024", "June 2026", "paid first month", "me@alexkonyakhin.com",
    "https://linkedin.com/in/alexkonyakhin", "https://t.me/pieceofwave", "https://calendar.app.google/ats6knZjWvwpJUbp9",
    "16 operational clusters", "since 2013", "Three companies co-founded", "Erasoft.io", "2015", "2022",
]
FORBIDDEN = [
    "17+", "40+", "×5 ARR", "5× over", "3× conversion", "$1M", "₽", "RUB",
    "world-class", "full-stack executive",
    # Task 6: Codex headings that must be gone
    "Is this your situation?", "One priority. Clear responsibilities.", "Start with a paid first month",
    # Task 7: old heading, product without a URL, and the "unnamed" label (spec §5 fallback)
    "About me", "Rostok", "unnamed",
]
EXACT_HREFS = {
    MAILTO,
    TELEGRAM,
    BOOKING,
    "https://linkedin.com/in/alexkonyakhin",
    "https://copix.app/",
    "https://nicepass.cc/",
    "https://stopwell.app/",
    "https://vpnkill.com/",
}
REQUIRED_CTAS = {
    ("book_call", "hero"),
    ("book_call", "work"),
    ("book_call", "contact"),
    ("telegram", "contact"),
    ("email", "contact"),
}

BLOCK_TAGS = {
    "p", "h1", "h2", "h3", "h4", "li", "dt", "dd", "div", "section", "article",
    "header", "footer", "nav", "main", "ul", "ol", "dl", "figure", "figcaption",
    "table", "tr", "td", "th",
}


@dataclass
class PageFacts:
    title: str = ""
    lang: str = ""
    description: str = ""
    h1_count: int = 0
    ids: list = field(default_factory=list)
    hrefs: list = field(default_factory=list)
    fragments: list = field(default_factory=list)
    ld_json: str = ""
    ctas: list = field(default_factory=list)  # (cta, location, href)
    text: str = ""


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.facts = PageFacts()
        self._hidden = []  # open script/style/title tags
        self._in_ld_json = False
        self._title = []
        self._text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        f = self.facts
        if tag == "html":
            f.lang = a.get("lang") or ""
        if tag == "h1":
            f.h1_count += 1
        if a.get("id"):
            f.ids.append(a["id"])
        if tag == "a" and a.get("href") is not None:
            href = a["href"]
            f.hrefs.append(href)
            if href.startswith("#"):
                f.fragments.append(href[1:])
            if a.get("data-cta"):
                f.ctas.append((a["data-cta"], a.get("data-cta-location") or "", href))
        if tag == "meta" and a.get("name") == "description":
            f.description = a.get("content") or ""
        if tag in ("script", "style", "title"):
            self._hidden.append(tag)
            if tag == "script" and a.get("type") == "application/ld+json":
                self._in_ld_json = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "title") and self._hidden and self._hidden[-1] == tag:
            self._hidden.pop()
            if tag == "script":
                self._in_ld_json = False
        elif tag in BLOCK_TAGS:
            self._text.append("\n")

    def handle_data(self, data):
        if self._in_ld_json:
            self.facts.ld_json += data
        elif self._hidden and self._hidden[-1] == "title":
            self._title.append(data)
        elif not self._hidden:
            self._text.append(data)

    def result(self):
        f = self.facts
        f.title = " ".join("".join(self._title).split())
        f.text = " ".join("".join(self._text).split())
        return f


def parse_page(html):
    parser = _PageParser()
    parser.feed(html)
    parser.close()
    return parser.result()


def check_required(text, required):
    return [f"FAIL: missing text: {s}" for s in required if s not in text]


def check_forbidden(text, forbidden):
    return [f"FAIL: forbidden text: {s}" for s in forbidden if s in text]


def check_sources_forbidden(sources, forbidden):
    """Scan raw file text, so comments, attributes, the title and structured data are covered too."""
    fails = []
    for name, text in sources.items():
        fails += [f"FAIL: {name} forbidden text: {s}" for s in forbidden if s in text]
    return fails


def check_hrefs(facts):
    return [
        f"FAIL: unexpected href: {h}"
        for h in facts.hrefs
        if h.startswith(("http", "mailto:")) and h not in EXACT_HREFS
    ]


def check_anchors(facts):
    ids = set(facts.ids)
    return [f"FAIL: anchor without target: #{frag}" for frag in facts.fragments if frag not in ids]


def check_ctas(facts):
    fails = []
    present = {(cta, location) for cta, location, _ in facts.ctas}
    for pair in sorted(REQUIRED_CTAS - present):
        fails.append(f"FAIL: missing CTA {pair}")
    book_hrefs = {href for cta, _, href in facts.ctas if cta == "book_call"}
    if len(book_hrefs) > 1:
        fails.append(f"FAIL: book_call hrefs differ: {sorted(book_hrefs)}")
    for href in sorted(book_hrefs):
        if href != BOOKING:
            fails.append(f"FAIL: book_call href is not the booking page: {href}")
    for cta, _, href in facts.ctas:
        if cta == "email" and href != MAILTO:
            fails.append(f"FAIL: email CTA href is not the mailto: {href}")
        if cta == "telegram" and href != TELEGRAM:
            fails.append(f"FAIL: telegram CTA href is not the Telegram link: {href}")
    return fails


def check_structure(facts):
    fails = []
    if facts.h1_count != 1:
        fails.append(f"FAIL: expected one h1, found {facts.h1_count}")
    duplicates = sorted({i for i in facts.ids if facts.ids.count(i) > 1})
    if duplicates:
        fails.append(f"FAIL: duplicate ids: {duplicates}")
    if facts.lang != "en":
        fails.append(f"FAIL: lang is {facts.lang!r}, expected 'en'")
    if not facts.title:
        fails.append("FAIL: title missing")
    return fails


TITLE = "Alexey Konyakhin · Fractional CPO · Belgrade (CET)"
DESCRIPTION = (
    "Fractional CPO based in Belgrade, Central European Time. I own product direction, "
    "priorities and delivery with your existing team. Paid first month, then monthly. "
    "EU, UK and US East Coast."
)
GA_ID = "G-K466B003HF"
PROD_HOSTS = "'alexkonyakhin.com', 'www.alexkonyakhin.com'"


def check_meta(facts):
    fails = []
    if facts.title != TITLE:
        fails.append(f"FAIL: title is {facts.title!r}")
    if facts.description != DESCRIPTION:
        fails.append(f"FAIL: description is {facts.description!r}")
    return fails


def check_ld_json(facts):
    try:
        data = json.loads(facts.ld_json)
    except json.JSONDecodeError as error:
        return [f"FAIL: ld_json does not parse: {error}"]
    fails = []
    if data.get("@type") != "Person":
        fails.append("FAIL: ld_json @type is not Person")
    if data.get("jobTitle") != "Fractional CPO":
        fails.append(f"FAIL: jobTitle is {data.get('jobTitle')!r}")
    address = data.get("address") or {}
    if address.get("addressLocality") != "Belgrade" or address.get("addressCountry") != "RS":
        fails.append(f"FAIL: address is {address!r}")
    if data.get("knowsLanguage") != ["en", "sr", "ru"]:
        fails.append(f"FAIL: knowsLanguage is {data.get('knowsLanguage')!r}")
    if data.get("sameAs") != ["https://linkedin.com/in/alexkonyakhin", "https://t.me/pieceofwave"]:
        fails.append(f"FAIL: sameAs is {data.get('sameAs')!r}")
    for key in ("worksFor", "owns", "aggregateRating", "review"):
        if key in data:
            fails.append(f"FAIL: ld_json must not contain {key}")
    return fails


def check_analytics(html):
    fails = []
    if PROD_HOSTS not in html:
        fails.append("FAIL: analytics: production hostname list missing or changed")
    if html.count(GA_ID) != 2:
        fails.append(f"FAIL: analytics: {GA_ID} appears {html.count(GA_ID)} times, expected 2")
    tracker = html.find("window.trackCta = function")
    gate = html.find(f"if ([{PROD_HOSTS}]")
    if tracker == -1 or gate == -1 or tracker > gate:
        fails.append("FAIL: analytics: trackCta no-op must be defined before the hostname gate")
    if "'cta_click'" not in html:
        fails.append("FAIL: analytics: cta_click event missing")
    return fails


def check_llms(llms_text):
    return [f"FAIL: llms.txt missing: {s}" for s in REQUIRED_LLMS if s not in llms_text]


def check_dist():
    spec = importlib.util.spec_from_file_location("site_build", ROOT / "scripts" / "site.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    expected = set(module.PUBLIC_FILES)
    actual = {p.name for p in DIST.iterdir()}
    if actual != expected:
        return [f"FAIL: dist contents {sorted(actual)} != public files {sorted(expected)}"]
    return []


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--forbidden-file", type=Path, help="extra forbidden terms, one per line")
    args = parser.parse_args(argv)
    extra = []
    if args.forbidden_file:
        extra = [line.strip() for line in args.forbidden_file.read_text().splitlines() if line.strip()]
    forbidden = FORBIDDEN + extra

    html = INDEX.read_text()
    facts = parse_page(html)
    fails = []
    fails += check_structure(facts)
    fails += check_meta(facts)
    fails += check_required(facts.text, REQUIRED_HTML)
    fails += check_hrefs(facts)
    fails += check_anchors(facts)
    fails += check_ctas(facts)
    fails += check_ld_json(facts)
    fails += check_analytics(html)

    llms_text = LLMS.read_text()
    fails += check_llms(llms_text)
    fails += check_sources_forbidden(
        {"index.html": html, "styles.css": (ROOT / "styles.css").read_text(), "llms.txt": llms_text},
        forbidden,
    )

    if DIST.exists():
        fails += check_dist()

    for line in fails:
        print(line)
    print("OK: all checks passed" if not fails else f"{len(fails)} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
