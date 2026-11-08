#!/usr/bin/env python3
"""Deterministic checks of the public page against the design spec.

Standard library only. Exit 0 when every check passes, 1 otherwise, printing one
``FAIL: ...`` line per failure. Private terms can be supplied from a file kept
outside the repository with ``--forbidden-file``.
"""

import argparse
import importlib.util
import json
import re
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
    "https://alexkonyakhin.com/sr/",
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

TITLE = "Alexey Konyakhin · Fractional CPO · Belgrade (CET)"
DESCRIPTION = (
    "Fractional CPO based in Belgrade, Central European Time. I own product direction, "
    "priorities and delivery with your existing team. Paid first month, then monthly. "
    "EU, UK and US East Coast."
)
GA_ID = "G-K466B003HF"
PROD_HOSTS = "'alexkonyakhin.com', 'www.alexkonyakhin.com'"
TITLE_SR = "Alexey Konyakhin · Fractional CPO · Beograd"
DESCRIPTION_SR = (
    "Fractional CPO iz Beograda. Preuzimam pravac proizvoda, prioritete i isporuku zajedno sa vašim "
    "postojećim timom. Plaćeni prvi mesec, zatim mesečno. Srbija, EU i UK."
)
REQUIRED_HTML_SR = [
    # header and first screen (spec §3.1–3.2)
    "Preskoči na sadržaj",
    "Fractional CPO · Beograd",
    "Projekti", "Kako radim", "Iskustvo",
    "Fractional CPO za softverske kompanije koje vode osnivači.",
    "Preuzimam odgovornost za pravac proizvoda, prioritete i isporuku zajedno sa vašim postojećim timom, "
    "tako da važan posao napreduje, a da svaka odluka ne mora da prolazi kroz vas.",
    "Za kompanije koje imaju korisnike koji plaćaju i interni razvojni tim. Srbija, region, EU i UK.",
    "Beograd · sastanci uživo ili onlajn",
    "Radni jezici: srpski i engleski",
    "Registrovani preduzetnik u Srbiji · fakturisanje u RSD ili EUR",
    "Proizvod i inženjering od 2013.",
    "Zakažite razgovor od 30 minuta", "Pogledajte projekte",
    # proof band (§3.3)
    "300k+ mesečno aktivnih korisnika", "aplikacija za zaposlene koju sam vodio kao head of product",
    "3× mesečni promet", "mreža mobilne štampe, april 2024 – jun 2026",
    "20.000 prijava za posao", "u prva tri meseca procesa zapošljavanja koji sam vodio",
    "3 suosnovane kompanije", "2015 – 2022",
    # work (§3.4)
    "Aplikacija za zaposlene velikog maloprodajnog lanca",
    "Head of product za celu aplikaciju · Maloprodaja · Rusija",
    "Vodio sam proizvod: pravac, prioritete, istraživanje, isporuku i merenje. Vodio sam programere, "
    "dizajnera i QA i iznosio hipoteze i odluke pred najviše rukovodstvo.",
    "Mesečno aktivni korisnici", "300k+", "tokom mog rada na proizvodu",
    "Prijave za posao", "20.000", "u prva tri meseca procesa zapošljavanja",
    "Analitika: od događaja do odluka.",
    "Vodio sam implementaciju kompletnog analitičkog sistema sa timom: pokrivenost događaja u Firebase-u, "
    "pipeline ka BigQuery-ju i prilagođene Looker dashboarde koji su rukovodstvu dali uvid u to kako zaposleni koriste aplikaciju.",
    "Proces zapošljavanja.",
    "Otvorili smo aplikaciju i za one koji još nisu zaposleni, tako da su kandidati za posao kasira i radnika u prodavnicama mogli direktno da se prijave.",
    "Igra za učenje.",
    "Ideja jednog zaposlenog koju sam pretvorio u igru unutar aplikacije, zasnovanu na postojećim materijalima za obuku, "
    "i pilotirao u 16 operativnih klastera.",
    "Copix, mreža mobilne štampe",
    "Rad na proizvodu sa osnivačkim timom · Rusija · 2024 – 2026",
    "Radio sam sa timom na mobilnom korisničkom putu, povraćaju novca za neuspele otiske i povratnim informacijama od podrške ka proizvodu.",
    "Mesečni promet karticama", "3×", "april 2024 – jun 2026",
    "Promet po aktivnom štampaču", "2,15×",
    "Rezultati cele mreže tokom saradnje, uz promene cena i same mreže.",
    # situations and process (§3.5–3.6)
    "Kada me osnivači zovu",
    "Tim isporučuje, ali poslovni prioritet stalno pada u drugi plan.",
    "Jedna inicijativa obuhvata proizvod, inženjering i operacije, a nema vlasnika.",
    "Previše odluka i dalje dolazi do vas.",
    "Plaćeni prvi mesec.",
    "Dogovaramo se oko poslovnog problema, gledamo dokaze koje već imate i postavljamo jedan prioritet sa jasnim vlasnicima "
    "i praktičnim planom. Obim prati pristup, ljude i budžet koje zaista možete da obezbedite.",
    "Zatim iz meseca u mesec.",
    "Ako se uklopimo, nastavljam kao vaš fractional CPO: pravac proizvoda, kompromisi, zavisnosti između proizvoda, "
    "inženjeringa i operacija, i držanje posla uz cilj koji smo dogovorili. Broj dana nedeljno i obim dogovaramo pojedinačno.",
    "Kontrolne tačke, bez vezivanja.",
    "Polazno stanje i kriterijumi uspeha postavljaju se unapred. Na svakom pregledu nastavljamo, menjamo obim ili "
    "završavamo urednom primopredajom.",
    "Ko šta radi",
    "Ja vodim pravac proizvoda, prioritete, kompromise, usklađivanje stejkholdera i merenje. Vi ste vlasnik poslovnog "
    "cilja, budžeta, pristupa i prava odlučivanja. Vaš CTO i tim odgovorni su za tehnički kvalitet, procene i svakodnevnu isporuku.",
    "Nije uključeno: neograničen razvoj, stalna dostupnost, agencijski tim iza mene niti garantovani rezultati.",
    # background (§3.7)
    "2025 – danas CPO, platforma za komercijalne nekretnine",
    "2024 – 2026 Rad na proizvodu sa Copixom, mreža mobilne štampe",
    "2023 – danas COO i product lead, Erasoft.io, tim koji stoji iza aplikacije za zaposlene u maloprodaji",
    "2022 Senior Project Manager, Improvado, međunarodni tim",
    "2020 – 2022 Osnivač, LTVCAC.agency, performans marketing i JTBD istraživanja",
    "2017 – 2019 Suosnivač, Togezzer, interna komunikacija za distribuirane timove",
    "2015 – 2017 Suosnivač, Knedlik Tech, mobilna aplikacija za putovanja",
    "2013 – 2015 PM i tech lead, Globus, portfolio mobilnih i veb projekata",
    "Pravim i sopstvene proizvode.", "NicePass", "Stopwell", "VPNKill",
    # contact and footer (§3.8–3.9)
    "Razgovarajmo o vašem proizvodu.",
    "Recite mi nešto o svom proizvodu, timu koji imate i onome što ne napreduje. Iskreno ću vam reći da li mogu da pomognem.",
    "Pišite mi na Telegramu", "Pošaljite imejl", "me@alexkonyakhin.com",
    "Alexey Konyakhin · Beograd", "LinkedIn", "Telegram",
]

ALTERNATES = {
    ("en", "https://alexkonyakhin.com/"),
    ("sr-Latn", "https://alexkonyakhin.com/sr/"),
    ("x-default", "https://alexkonyakhin.com/"),
}
INTERNAL_PAGES = {"/", "/sr/"}
LANG_LITERAL = "lang: document.documentElement.lang.split('-')[0]"


@dataclass
class PageSpec:
    lang: str
    title: str
    description: str
    og_locale: str
    required: list
    switch_href: str
    switch_lang: str
    switch_text: str
    home_href: str
    canonical: str
    og_title: str
    og_description: str
    ld_description: str


H1_EN = "Fractional CPO for founder-led software companies."
SUBHEAD_EN = ("I take ownership of product direction, priorities and delivery alongside your existing team, "
              "so the important work moves without every decision coming back to you.")
H1_SR = "Fractional CPO za softverske kompanije koje vode osnivači."
SUBHEAD_SR = ("Preuzimam odgovornost za pravac proizvoda, prioritete i isporuku zajedno sa vašim postojećim timom, "
              "tako da važan posao napreduje, a da svaka odluka ne mora da prolazi kroz vas.")

PAGES = {
    "index.html": PageSpec(
        "en", TITLE, DESCRIPTION, "en_GB", REQUIRED_HTML, "/sr/", "sr-Latn", "Srpski",
        home_href="/", canonical="https://alexkonyakhin.com/", og_title=H1_EN, og_description=SUBHEAD_EN,
        ld_description="Fractional CPO for founder-led software companies in the EU and UK, based in Belgrade.",
    ),
    "sr/index.html": PageSpec(
        "sr-Latn", TITLE_SR, DESCRIPTION_SR, "sr_RS", REQUIRED_HTML_SR, "/", "en", "English",
        home_href="/sr/", canonical="https://alexkonyakhin.com/sr/", og_title=H1_SR, og_description=SUBHEAD_SR,
        ld_description="Fractional CPO iz Beograda za softverske kompanije koje vode osnivači.",
    ),
}

@dataclass
class PageFacts:
    title: str = ""
    lang: str = ""
    description: str = ""
    og_locale: str = ""
    og_url: str = ""
    og_title: str = ""
    og_description: str = ""
    canonical: str = ""
    identity_href: str = ""
    h1_count: int = 0
    heading_counts: dict = field(default_factory=dict)
    ids: list = field(default_factory=list)
    hrefs: list = field(default_factory=list)
    fragments: list = field(default_factory=list)
    local_assets: list = field(default_factory=list)
    alternates: list = field(default_factory=list)  # (hreflang, href)
    switches: list = field(default_factory=list)  # (href, lang, hreflang, text)
    ld_json: str = ""
    ctas: list = field(default_factory=list)  # (cta, location, href)
    text: str = ""


def _is_local(value):
    return not value.startswith(("http", "mailto:", "#", "data:"))


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.facts = PageFacts()
        self._hidden = []  # open script/style/title tags
        self._in_ld_json = False
        self._title = []
        self._text = []
        self._switch = None  # (href, lang, hreflang) while inside a switch anchor
        self._switch_text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        f = self.facts
        if tag == "html":
            f.lang = a.get("lang") or ""
        if tag == "h1":
            f.h1_count += 1
        if tag in ("h1", "h2", "h3", "h4"):
            f.heading_counts[tag] = f.heading_counts.get(tag, 0) + 1
        if a.get("id"):
            f.ids.append(a["id"])
        asset = a.get("href") if tag == "link" else a.get("src") if tag in ("img", "script") else None
        if asset and _is_local(asset):
            f.local_assets.append(asset)
        if tag == "a" and a.get("href") is not None:
            href = a["href"]
            f.hrefs.append(href)
            if "identity" in (a.get("class") or "").split():
                f.identity_href = href
            if href.startswith("#"):
                f.fragments.append(href[1:])
            if a.get("data-cta"):
                f.ctas.append((a["data-cta"], a.get("data-cta-location") or "", href))
            if a.get("hreflang"):
                self._switch = (href, a.get("lang") or "", a["hreflang"])
                self._switch_text = []
        if tag == "link" and a.get("rel") == "alternate" and a.get("hreflang"):
            f.alternates.append((a["hreflang"], a.get("href") or ""))
        if tag == "link" and a.get("rel") == "canonical":
            f.canonical = a.get("href") or ""
        if tag == "meta" and a.get("name") == "description":
            f.description = a.get("content") or ""
        if tag == "meta" and a.get("property") == "og:locale":
            f.og_locale = a.get("content") or ""
        if tag == "meta" and a.get("property") == "og:url":
            f.og_url = a.get("content") or ""
        if tag == "meta" and a.get("property") == "og:title":
            f.og_title = a.get("content") or ""
        if tag == "meta" and a.get("property") == "og:description":
            f.og_description = a.get("content") or ""
        if tag in ("script", "style", "title"):
            self._hidden.append(tag)
            if tag == "script" and a.get("type") == "application/ld+json":
                self._in_ld_json = True

    def handle_endtag(self, tag):
        if tag == "a" and self._switch is not None:
            href, lang, hreflang = self._switch
            self.facts.switches.append((href, lang, hreflang, " ".join("".join(self._switch_text).split())))
            self._switch = None
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
            if self._switch is not None:
                self._switch_text.append(data)

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


def check_sources_private(sources, patterns):
    """Private terms come from a file outside the repository, one regular expression per line, matched case-insensitively."""
    fails = []
    for name, text in sources.items():
        fails += [f"FAIL: {name}: private term matched: {p.pattern}" for p in patterns if p.search(text)]
    return fails


def check_hrefs(facts):
    fails = []
    for h in facts.hrefs:
        if h.startswith(("http", "mailto:")):
            if h not in EXACT_HREFS:
                fails.append(f"FAIL: unexpected href: {h}")
        elif not h.startswith("#") and h not in INTERNAL_PAGES:
            fails.append(f"FAIL: unexpected internal href: {h}")
    return fails


def check_assets(facts):
    return [f"FAIL: local asset path must start with /: {v}" for v in facts.local_assets if not v.startswith("/")]


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


def check_structure(facts, lang):
    fails = []
    if facts.h1_count != 1:
        fails.append(f"FAIL: expected one h1, found {facts.h1_count}")
    duplicates = sorted({i for i in facts.ids if facts.ids.count(i) > 1})
    if duplicates:
        fails.append(f"FAIL: duplicate ids: {duplicates}")
    if facts.lang != lang:
        fails.append(f"FAIL: lang is {facts.lang!r}, expected {lang!r}")
    if not facts.title:
        fails.append("FAIL: title missing")
    return fails


def check_meta(facts, spec):
    fails = []
    if facts.title != spec.title:
        fails.append(f"FAIL: title is {facts.title!r}")
    if facts.description != spec.description:
        fails.append(f"FAIL: description is {facts.description!r}")
    if facts.og_locale != spec.og_locale:
        fails.append(f"FAIL: og:locale is {facts.og_locale!r}, expected {spec.og_locale!r}")
    if facts.canonical != spec.canonical:
        fails.append(f"FAIL: canonical is {facts.canonical!r}, expected {spec.canonical!r}")
    if facts.og_url != spec.canonical:
        fails.append(f"FAIL: og:url is {facts.og_url!r}, expected {spec.canonical!r}")
    if facts.og_title != spec.og_title:
        fails.append(f"FAIL: og:title is {facts.og_title!r}")
    if facts.og_description != spec.og_description:
        fails.append(f"FAIL: og:description is {facts.og_description!r}")
    return fails


def check_home(facts, spec):
    if facts.identity_href != spec.home_href:
        return [f"FAIL: home (identity) link is {facts.identity_href!r}, expected {spec.home_href!r}"]
    return []


def check_alternates(facts):
    if set(facts.alternates) != ALTERNATES:
        return [f"FAIL: alternates are {sorted(facts.alternates)}, expected {sorted(ALTERNATES)}"]
    return []


def check_switch(facts, spec):
    if len(facts.switches) != 1:
        return [f"FAIL: switch: expected one language switch, found {len(facts.switches)}"]
    href, lang, hreflang, text = facts.switches[0]
    fails = []
    if href != spec.switch_href:
        fails.append(f"FAIL: switch href is {href!r}, expected {spec.switch_href!r}")
    if hreflang != spec.switch_lang or lang != spec.switch_lang:
        fails.append(f"FAIL: switch lang/hreflang are {lang!r}/{hreflang!r}, expected {spec.switch_lang!r}")
    if text != spec.switch_text:
        fails.append(f"FAIL: switch text is {text!r}, expected {spec.switch_text!r}")
    return fails


def check_ld_json(facts, spec):
    try:
        data = json.loads(facts.ld_json)
    except json.JSONDecodeError as error:
        return [f"FAIL: ld_json does not parse: {error}"]
    fails = []
    if data.get("@type") != "Person":
        fails.append("FAIL: ld_json @type is not Person")
    if data.get("jobTitle") != "Fractional CPO":
        fails.append(f"FAIL: jobTitle is {data.get('jobTitle')!r}")
    if data.get("description") != spec.ld_description:
        fails.append(f"FAIL: ld_json description is {data.get('description')!r}")
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
    if LANG_LITERAL not in html:
        fails.append("FAIL: analytics: lang parameter missing from cta_click")
    return fails


def check_parity(en, sr):
    fails = []
    if set(en.ids) != set(sr.ids):
        fails.append(f"FAIL: parity: ids differ: {sorted(set(en.ids) ^ set(sr.ids))}")
    if en.heading_counts != sr.heading_counts:
        fails.append(f"FAIL: parity: heading counts differ: {en.heading_counts} vs {sr.heading_counts}")
    en_ctas = {(c, l) for c, l, _ in en.ctas}
    sr_ctas = {(c, l) for c, l, _ in sr.ctas}
    if en_ctas != sr_ctas:
        fails.append(f"FAIL: parity: CTA sets differ: {sorted(en_ctas ^ sr_ctas)}")
    external = lambda hrefs: sorted(h for h in hrefs if h.startswith(("http", "mailto:")))
    if external(en.hrefs) != external(sr.hrefs):
        fails.append(f"FAIL: parity: external destinations differ: {external(en.hrefs)} vs {external(sr.hrefs)}")
    return fails


def check_llms(llms_text):
    return [f"FAIL: llms.txt missing: {s}" for s in REQUIRED_LLMS if s not in llms_text]


def public_files():
    spec = importlib.util.spec_from_file_location("site_build", ROOT / "scripts" / "site.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return set(module.PUBLIC_FILES)


def check_published(pages, css):
    """Every local file a page or the stylesheet points at must be in the published set."""
    published = public_files()
    referenced = {asset for facts in pages.values() for asset in facts.local_assets}
    referenced |= {url for url in re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", css) if _is_local(url)}
    return [f"FAIL: referenced but not published: {ref}" for ref in sorted(referenced)
            if ref.lstrip("/").split("#")[0].split("?")[0] not in published]


def check_dist():
    expected = public_files()
    actual = {p.relative_to(DIST).as_posix() for p in DIST.rglob("*") if p.is_file()}
    if actual != expected:
        return [f"FAIL: dist contents {sorted(actual)} != public files {sorted(expected)}"]
    return []


def check_page(path, spec, html):
    facts = parse_page(html)
    fails = []
    fails += check_structure(facts, spec.lang)
    fails += check_meta(facts, spec)
    fails += check_home(facts, spec)
    fails += check_required(facts.text, spec.required)
    fails += check_hrefs(facts)
    fails += check_assets(facts)
    fails += check_anchors(facts)
    fails += check_ctas(facts)
    fails += check_alternates(facts)
    fails += check_switch(facts, spec)
    fails += check_ld_json(facts, spec)
    fails += check_analytics(html)
    return facts, [f.replace("FAIL:", f"FAIL: {path}:", 1) for f in fails]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--forbidden-file", type=Path, help="private terms as regular expressions, one per line, matched case-insensitively")
    args = parser.parse_args(argv)
    private = []
    if args.forbidden_file:
        private = [re.compile(line.strip(), re.IGNORECASE) for line in args.forbidden_file.read_text().splitlines() if line.strip()]

    fails = []
    pages = {}
    sources = {}
    for path, spec in PAGES.items():
        file = ROOT / path
        if not file.exists():
            fails.append(f"FAIL: {path}: file missing")
            continue
        html = file.read_text()
        sources[path] = html
        pages[path], page_fails = check_page(path, spec, html)
        fails += page_fails
    if len(pages) == len(PAGES):
        fails += check_parity(pages["index.html"], pages["sr/index.html"])

    llms_text = LLMS.read_text()
    fails += check_llms(llms_text)
    sources["styles.css"] = (ROOT / "styles.css").read_text()
    sources["llms.txt"] = llms_text
    fails += check_published(pages, sources["styles.css"])
    fails += check_sources_forbidden(sources, FORBIDDEN)
    fails += check_sources_private(sources, private)

    if DIST.exists():
        fails += check_dist()

    for line in fails:
        print(line)
    print("OK: all checks passed" if not fails else f"{len(fails)} failure(s)")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
