#!/usr/bin/env python3
"""
Build-time Manifold Markets ingestion and quantitative backtest pipeline.

1. Backtest: Queries resolved binary markets from Manifold Markets across
   AI, Energy, Biotech, and Macro domains, samples each market's price at a
   fixed 7-day horizon before close/resolution via /v0/bets, applies ONE
   pre-registered rule (logistic extremization, k = 1.15), and computes
   exact Brier score, Log-Loss, Brier Skill Score, and Tail-Bin Score
   (<15% / >85%) against the Manifold crowd baseline.

2. Live Markets: Fetches 20 active, non-expired binary markets (5 per domain)
   and applies the exact same logistic extremization rule (k = 1.15).

3. Forward Ledger: Maintains an append-only forward ledger in
   data/forward_ledger.json starting 26 Nov 2026.

Outputs:
  - public/data/markets.json
  - data/forward_ledger.json
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://api.manifold.markets/v0"
USER_AGENT = "CalibratedForecastingEngine/3.0 (Mohammed KM)"

# Pre-registered quantitative rule (applied identically to backtest and live markets)
EXTREMIZATION_K = 1.15
HORIZON_DAYS = 7
TAIL_LOW = 0.15
TAIL_HIGH = 0.85

RULE_SPEC = {
    "id": "logistic_extremization_k1.15",
    "name": "Logistic Extremization (k = 1.15)",
    "formula": "p_model = sigmoid(1.15 * logit(p_market))",
    "parameterK": EXTREMIZATION_K,
    "horizonDays": HORIZON_DAYS,
    "tailThresholdLow": TAIL_LOW,
    "tailThresholdHigh": TAIL_HIGH,
    "summary": (
        "Transforms each market probability p into log-odds, multiplies by k = 1.15, "
        "and maps back through the logistic sigmoid (clamped to [1%, 99%]). "
        "Backtest prices are sampled 7 days before market close/resolution."
    ),
}

DOMAINS = ["AI", "Energy", "Biotech", "Macro"]

DOMAIN_KEYWORDS = {
    "AI": [
        r"\bai\b", r"\bllm\b", r"\bagi\b", r"openai", r"anthropic", r"claude",
        r"gemini", r"gpt-", r"deepmind", r"nvidia", r"benchmark", r"frontier model",
        r"artificial intelligence", r"reasoning model", r"transformer", r"compute",
        r"autonomous", r"robotics", r"humanoid", r"swe-bench", r"arc-agi", r"chatgpt",
    ],
    "Energy": [
        r"fusion", r"nuclear", r"solar", r"grid", r"battery", r"oil", r"crude",
        r"brent", r"wti", r"smr", r"reactor", r"renewable", r"gigawatt", r"\bgw\b",
        r"electricity", r"energy", r"lithium", r"geothermal", r"climate", r"carbon",
        r"\bev\b", r"electric vehicle", r"power plant", r"natural gas",
    ],
    "Biotech": [
        r"fda", r"trial", r"phase 3", r"phase iii", r"vaccine", r"crispr",
        r"gene therapy", r"glp-1", r"ozempic", r"longevity", r"alzheimer",
        r"cancer", r"biotech", r"drug", r"clinical", r"mrna", r"protein",
        r"alphafold", r"pandemic", r"h5n1", r"bird flu", r"nobel",
        r"nasa", r"mars", r"spacex", r"starship",
    ],
    "Macro": [
        r"\bfed\b", r"federal reserve", r"interest rate", r"inflation", r"\bcpi\b",
        r"recession", r"\bgdp\b", r"unemployment", r"tariff", r"s&p 500",
        r"treasury", r"yield", r"central bank", r"\becb\b", r"china", r"economy",
        r"economic", r"debt", r"deficit", r"gold", r"bitcoin", r"dollar",
        r"nasdaq", r"rate cut", r"rate hike",
    ],
}

EXCLUDE_PATTERNS = [
    r"will i\b", r"\bmy\b", r"manifold", r"\bmana\b", r"resolve yes if",
    r"free money", r"subsidy", r"test market", r"shitpost", r"meme",
    r"\bnba\b", r"\bnfl\b", r"\bufc\b", r"premier league", r"world cup", r"oscar",
    r"grammy", r"taylor swift", r"mrbeast", r"twitch", r"youtube",
    r"nuclear war", r"nuclear weapon", r"\bnuke\b", r"wipe out humanity",
    r"election", r"president", r"trump", r"biden", r"harris", r"senate",
    r"solar system", r"solar eclipse", r"solar planetary", r"cybertruck",
    r"be a fed\b", r"fuentes", r"polymarket", r"parlay", r"metaculus",
    r"risk[- ]free", r"interest rate market", r"resolve no on", r"milky way",
]

DOMAIN_SEARCH_TERMS = {
    "AI": ["OpenAI", "Anthropic", "AGI", "GPT", "Nvidia"],
    "Energy": ["fusion", "nuclear power", "solar", "crude oil", "battery"],
    "Biotech": ["FDA", "cancer", "vaccine", "CRISPR", "clinical trial"],
    "Macro": ["interest rate", "recession", "inflation", "GDP", "S&P 500"],
}

DOMAIN_CHECKLIST_TEMPLATES = {
    "AI": {
        "ref_class": "frontier capability & deployment milestones",
        "checklist_note": "Check whether the contract hinges on a public benchmark readout, an official release changelog, or private evaluation splits.",
        "falsifiers": [
            "Independent benchmark verification on held-out private splits",
            "Official release changelog or compute capital filing",
        ],
    },
    "Energy": {
        "ref_class": "physical infrastructure, grid interconnection, and commodity cycles",
        "checklist_note": "Check permitting lead times, interconnection queue dates, and published EIA/IEA capacity telemetry.",
        "falsifiers": [
            "EIA / IEA quarterly capacity and generation telemetry",
            "Binding EPC milestone, interconnection approval, or OPEC+ quota revision",
        ],
    },
    "Biotech": {
        "ref_class": "clinical trial readouts and regulatory approvals",
        "checklist_note": "Check primary endpoint definitions on ClinicalTrials.gov and scheduled FDA PDUFA or advisory committee dates.",
        "falsifiers": [
            "Peer-reviewed primary endpoint readout on ClinicalTrials.gov",
            "FDA PDUFA action letter or advisory committee vote",
        ],
    },
    "Macro": {
        "ref_class": "central bank policy cycles and official macro releases",
        "checklist_note": "Compare Manifold prices against OIS/SOFR futures, Fed Funds implied odds, and official release calendars.",
        "falsifiers": [
            "Official BLS, BEA, or FOMC statement release",
            "Implied probability shift in 30-day Fed Funds or Treasury term structure",
        ],
    },
}


def http_get_json(url: str, timeout: int = 10):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def clamp(v: float, lo: float = 0.01, hi: float = 0.99) -> float:
    return max(lo, min(hi, v))


def logit(p: float) -> float:
    p_c = clamp(p, 0.005, 0.995)
    return math.log(p_c / (1.0 - p_c))


def inv_logit(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def apply_rule(p_market: float, k: float = EXTREMIZATION_K) -> float:
    """Single pre-registered rule: logistic extremization by factor k."""
    p_c = clamp(float(p_market), 0.01, 0.99)
    return round(clamp(inv_logit(k * logit(p_c)), 0.01, 0.99), 4)


def brier_score(p: float, y: int) -> float:
    return (p - y) ** 2


def log_loss(p: float, y: int) -> float:
    p_c = clamp(p, 0.01, 0.99)
    return -math.log(p_c) if y == 1 else -math.log(1.0 - p_c)


def classify_domain(question: str):
    q = question.lower()
    for pat in EXCLUDE_PATTERNS:
        if re.search(pat, q):
            return None

    scores = {}
    for domain, patterns in DOMAIN_KEYWORDS.items():
        score = sum(1 for p in patterns if re.search(p, q))
        if score > 0:
            scores[domain] = score

    if not scores:
        return None
    best = sorted(scores.items(), key=lambda kv: (-kv[1], DOMAINS.index(kv[0])))[0][0]
    return best


def has_past_deadline_in_text(question: str, current_year: int) -> bool:
    """Reject questions explicitly referencing a past deadline year (e.g. EOY 2025)."""
    q = question.lower()
    # Any explicit 4-digit year strictly earlier than current_year
    for match in re.finditer(r"\b(20\d\d)\b", q):
        yr = int(match.group(1))
        if yr < current_year:
            return True
    # Phrases like "before 2026" when we are already in 2026
    if re.search(rf"\bbefore\s+{current_year}\b", q):
        return True
    return False


def is_clean_open_binary(m: dict, now_ms: int, current_year: int) -> bool:
    if m.get("outcomeType") != "BINARY":
        return False
    if m.get("isResolved"):
        return False
    close_ms = m.get("closeTime")
    if not close_ms or float(close_ms) <= now_ms + 86400 * 1000:
        return False
    prob = m.get("probability")
    if prob is None or not (0.01 <= float(prob) <= 0.99):
        return False
    q = (m.get("question") or "").strip()
    if len(q) < 18 or len(q) > 160:
        return False
    if has_past_deadline_in_text(q, current_year):
        return False
    liq = float(m.get("totalLiquidity") or 0)
    vol = float(m.get("volume") or 0)
    if liq < 50 and vol < 100:
        return False
    return True


def is_clean_resolved_binary(m: dict) -> bool:
    if m.get("outcomeType") != "BINARY":
        return False
    if not m.get("isResolved"):
        return False
    if m.get("resolution") not in ("YES", "NO"):
        return False
    q = (m.get("question") or "").strip()
    if len(q) < 15 or len(q) > 180:
        return False
    liq = float(m.get("totalLiquidity") or 0)
    vol = float(m.get("volume") or 0)
    if liq < 50 and vol < 100:
        return False
    res_ms = m.get("resolutionTime") or m.get("closeTime")
    created_ms = m.get("createdTime")
    if not res_ms or not created_ms:
        return False
    # Must have been open long enough to have a meaningful T - 7d snapshot
    if float(res_ms) - float(created_ms) < (HORIZON_DAYS + 2) * 86400 * 1000:
        return False
    return True


def fetch_horizon_price(market: dict):
    """
    Fetch the exact market probability at T - HORIZON_DAYS before
    min(closeTime, resolutionTime) using Manifold's /v0/bets endpoint.
    Returns (market, p_horizon, horizon_ms) or None if unavailable.
    """
    cid = market["id"]
    res_ms = float(market.get("resolutionTime") or market.get("closeTime"))
    close_ms = float(market.get("closeTime") or res_ms)
    anchor_ms = min(res_ms, close_ms)
    target_ms = int(anchor_ms - HORIZON_DAYS * 86400 * 1000)

    url = f"{BASE_URL}/bets?contractId={urllib.parse.quote(cid)}&beforeTime={target_ms}&limit=1"
    try:
        bets = http_get_json(url, timeout=8)
        if not bets:
            return None
        p_h = bets[0].get("probAfter")
        if p_h is None:
            return None
        p_h = float(p_h)
        if not (0.01 <= p_h <= 0.99):
            return None
        return (market, round(p_h, 4), int(anchor_ms))
    except Exception:
        return None


def compute_metrics_for_records(records: list) -> dict:
    """Compute exact Brier, Log-Loss, Skill Score, Tail-Bin (<15%/>85%), and decile bins."""
    n = len(records)
    if n == 0:
        return {
            "resolvedCount": 0,
            "empiricalYesRate": 0.5,
            "brierScore": 0.0,
            "marketBrierScore": 0.0,
            "logLoss": 0.0,
            "marketLogLoss": 0.0,
            "brierSkillPct": 0.0,
            "tailBrierScore": None,
            "marketTailBrierScore": None,
            "tailEventCount": 0,
            "calibrationBins": [],
        }

    mod_brier = sum(brier_score(r["modelProb"], r["y"]) for r in records) / n
    mkt_brier = sum(brier_score(r["marketProb"], r["y"]) for r in records) / n
    mod_ll = sum(log_loss(r["modelProb"], r["y"]) for r in records) / n
    mkt_ll = sum(log_loss(r["marketProb"], r["y"]) for r in records) / n
    skill_pct = ((1.0 - (mod_brier / mkt_brier)) * 100.0) if mkt_brier > 0 else 0.0
    yes_rate = sum(r["y"] for r in records) / n

    # Tail-bin score (<15% / >85% based on market price at horizon)
    tail_recs = [r for r in records if r["marketProb"] < TAIL_LOW or r["marketProb"] > TAIL_HIGH]
    tail_n = len(tail_recs)
    if tail_n > 0:
        tail_mod_brier = round(sum(brier_score(r["modelProb"], r["y"]) for r in tail_recs) / tail_n, 4)
        tail_mkt_brier = round(sum(brier_score(r["marketProb"], r["y"]) for r in tail_recs) / tail_n, 4)
    else:
        tail_mod_brier = None
        tail_mkt_brier = None

    # Decile reliability bins (0-10%, ..., 90-100%)
    bins = []
    for i in range(10):
        lo = i / 10.0
        hi = (i + 1) / 10.0
        label = f"{i * 10}-{(i + 1) * 10}%"
        in_mod = [r for r in records if (lo <= r["modelProb"] < hi) or (i == 9 and r["modelProb"] == 1.0)]
        in_mkt = [r for r in records if (lo <= r["marketProb"] < hi) or (i == 9 and r["marketProb"] == 1.0)]
        if not in_mod and not in_mkt:
            continue
        mod_pred = sum(r["modelProb"] for r in in_mod) / len(in_mod) if in_mod else (lo + hi) / 2.0
        mod_emp = sum(r["y"] for r in in_mod) / len(in_mod) if in_mod else None
        mkt_pred = sum(r["marketProb"] for r in in_mkt) / len(in_mkt) if in_mkt else (lo + hi) / 2.0
        mkt_emp = sum(r["y"] for r in in_mkt) / len(in_mkt) if in_mkt else None
        bins.append({
            "bin": label,
            "predicted": round(mod_pred, 4),
            "empirical": round(mod_emp, 4) if mod_emp is not None else None,
            "marketPredicted": round(mkt_pred, 4),
            "marketEmpirical": round(mkt_emp, 4) if mkt_emp is not None else None,
            "n": len(in_mod),
            "marketN": len(in_mkt),
            "isTail": (i == 0 or i == 9),
        })

    return {
        "resolvedCount": n,
        "empiricalYesRate": round(yes_rate, 4),
        "brierScore": round(mod_brier, 4),
        "marketBrierScore": round(mkt_brier, 4),
        "logLoss": round(mod_ll, 4),
        "marketLogLoss": round(mkt_ll, 4),
        "brierSkillPct": round(skill_pct, 2),
        "tailBrierScore": tail_mod_brier,
        "marketTailBrierScore": tail_mkt_brier,
        "tailEventCount": tail_n,
        "calibrationBins": bins,
    }


def run_resolved_backtest():
    """
    Build-time quantitative backtest over real resolved binary Manifold markets
    using /v0/markets and /v0/search-markets + /v0/bets at T - 7d horizon.
    """
    seen_ids = set()
    candidates_by_domain = {d: [] for d in DOMAINS}

    # 1. Sample from /v0/markets (general feed)
    try:
        general = http_get_json(f"{BASE_URL}/markets?limit=200", timeout=10)
        for m in general:
            if not is_clean_resolved_binary(m):
                continue
            dom = classify_domain(m.get("question", ""))
            if dom and m["id"] not in seen_ids:
                seen_ids.add(m["id"])
                candidates_by_domain[dom].append(m)
    except Exception as exc:
        print(f"[warn] Backtest /v0/markets failed: {exc}", file=sys.stderr)

    # 2. Query resolved binary markets per domain sorted by liquidity
    for dom, terms in DOMAIN_SEARCH_TERMS.items():
        for term in terms:
            if len(candidates_by_domain[dom]) >= 45:
                break
            qs = urllib.parse.urlencode({
                "term": term,
                "sort": "liquidity",
                "filter": "resolved",
                "contractType": "BINARY",
                "limit": 30,
            })
            try:
                batch = http_get_json(f"{BASE_URL}/search-markets?{qs}", timeout=10)
                for m in batch:
                    if not is_clean_resolved_binary(m):
                        continue
                    detected = classify_domain(m.get("question", ""))
                    if detected == dom and m["id"] not in seen_ids:
                        seen_ids.add(m["id"])
                        candidates_by_domain[dom].append(m)
            except Exception as exc:
                print(f"[warn] Backtest search '{term}' failed: {exc}", file=sys.stderr)

    # Select top 35 highest-liquidity candidates per domain (up to 140 total) to fetch T-7d bets
    to_fetch = []
    for dom in DOMAINS:
        ranked = sorted(
            candidates_by_domain[dom],
            key=lambda x: float(x.get("totalLiquidity") or 0) * 2 + float(x.get("volume") or 0),
            reverse=True,
        )[:35]
        for m in ranked:
            to_fetch.append((dom, m))

    records = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_horizon_price, m): dom for dom, m in to_fetch}
        for fut in as_completed(futures):
            dom = futures[fut]
            res = fut.result()
            if not res:
                continue
            m, p_mkt, anchor_ms = res
            y = 1 if m["resolution"] == "YES" else 0
            p_mod = apply_rule(p_mkt)
            records.append({
                "id": m["id"],
                "domain": dom,
                "marketProb": p_mkt,
                "modelProb": p_mod,
                "y": y,
                "resolvedMs": anchor_ms,
            })

    if not records:
        raise RuntimeError("Backtest returned 0 resolved markets from Manifold API.")

    min_ms = min(r["resolvedMs"] for r in records)
    max_ms = max(r["resolvedMs"] for r in records)
    start_str = datetime.fromtimestamp(min_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m")
    end_str = datetime.fromtimestamp(max_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m")

    overall = compute_metrics_for_records(records)
    by_domain = {}
    for dom in DOMAINS:
        dom_recs = [r for r in records if r["domain"] == dom]
        by_domain[dom] = compute_metrics_for_records(dom_recs)

    return {
        "resolvedCount": len(records),
        "window": f"{start_str} to {end_str}",
        "horizonDays": HORIZON_DAYS,
        "rule": RULE_SPEC,
        "overall": overall,
        "byDomain": by_domain,
    }


def fetch_live_markets(now_ms: int, current_year: int):
    seen_ids = set()
    by_domain = {d: [] for d in DOMAINS}
    api_status = "live"

    try:
        raw = http_get_json(f"{BASE_URL}/markets?limit=100", timeout=10)
        for m in raw:
            if not is_clean_open_binary(m, now_ms, current_year):
                continue
            dom = classify_domain(m.get("question", ""))
            if dom and m["id"] not in seen_ids:
                m["_source"] = "live"
                seen_ids.add(m["id"])
                by_domain[dom].append(m)
    except Exception as exc:
        print(f"[warn] Primary /v0/markets?limit=100 failed: {exc}", file=sys.stderr)
        api_status = "error"

    if api_status == "live":
        for dom, terms in DOMAIN_SEARCH_TERMS.items():
            for term in terms:
                if len(by_domain[dom]) >= 10:
                    break
                qs = urllib.parse.urlencode({
                    "term": term,
                    "sort": "liquidity",
                    "filter": "open",
                    "contractType": "BINARY",
                    "limit": 25,
                })
                try:
                    batch = http_get_json(f"{BASE_URL}/search-markets?{qs}", timeout=10)
                    for m in batch:
                        if not is_clean_open_binary(m, now_ms, current_year):
                            continue
                        detected = classify_domain(m.get("question", ""))
                        if detected == dom and m["id"] not in seen_ids:
                            m["_source"] = "live"
                            seen_ids.add(m["id"])
                            by_domain[dom].append(m)
                except Exception as exc:
                    print(f"[warn] Live search '{term}' failed: {exc}", file=sys.stderr)

    selected = []
    for dom in DOMAINS:
        ranked = sorted(
            by_domain[dom],
            key=lambda x: float(x.get("totalLiquidity") or 0) * 2 + float(x.get("volume") or 0),
            reverse=True,
        )
        for item in ranked[:5]:
            selected.append((dom, item))

    live_count = len(selected)
    return selected[:20], "live" if live_count > 0 else "error", live_count


def build_live_market_record(market: dict, domain: str, domain_bench: dict, idx: int) -> dict:
    """
    Apply the exact same pre-registered logistic extremization rule (k = 1.15)
    to a live Manifold market and construct a transparent calculation trace.
    """
    q = market["question"].strip()
    p_mkt = round(clamp(float(market["probability"]), 0.01, 0.99), 4)
    p_mod = apply_rule(p_mkt)
    edge = round(p_mod - p_mkt, 4)

    liq = round(float(market.get("totalLiquidity") or 0), 1)
    vol = round(float(market.get("volume") or 0), 1)
    is_tail = (p_mkt < TAIL_LOW or p_mkt > TAIL_HIGH or p_mod < TAIL_LOW or p_mod > TAIL_HIGH)

    domain_base_rate = domain_bench.get("empiricalYesRate", 0.5)
    domain_n = domain_bench.get("resolvedCount", 0)
    tpl = DOMAIN_CHECKLIST_TEMPLATES[domain]

    lo_mkt = logit(p_mkt)
    lo_mod = EXTREMIZATION_K * lo_mkt
    direction = "above" if edge >= 0 else "below"
    edge_pp = abs(round(edge * 100, 1))
    mkt_pct = round(p_mkt * 100, 1)
    mod_pct = round(p_mod * 100, 1)
    base_pct = round(domain_base_rate * 100, 1)

    rule_computation = (
        f"Market price p = {mkt_pct}% maps to log-odds {lo_mkt:+.3f}. "
        f"Applying the pre-registered extremization factor k = {EXTREMIZATION_K} gives "
        f"log-odds {lo_mod:+.3f}, which maps back via sigmoid to {mod_pct}% "
        f"({edge_pp} pp {direction} Manifold)."
    )

    base_rate_context = (
        f"In the {domain} resolved backtest sample (n = {domain_n} binary markets), "
        f"the empirical YES resolution rate is {base_pct}%. Current contract depth is "
        f"${liq:,.0f} liquidity and ${vol:,.0f} cumulative volume."
    )

    qualitative_template = (
        f"Illustrative domain checklist ({tpl['ref_class']} — template, not a bespoke thesis): "
        f"{tpl['checklist_note']}"
    )

    close_ms = market.get("closeTime")
    close_iso = datetime.fromtimestamp(float(close_ms) / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")

    return {
        "id": market.get("id", f"mkt-{idx+1}"),
        "question": q,
        "url": market.get("url") or f"https://manifold.markets/{market.get('creatorUsername', 'market')}/{market.get('slug', '')}",
        "domain": domain,
        "closeDate": close_iso,
        "liquidity": liq,
        "volume": vol,
        "traderCount": int(market.get("uniqueBettorCount") or 0),
        "source": "live",
        "marketProb": round(p_mkt, 4),
        "domainBaseRate": round(domain_base_rate, 4),
        "modelProb": round(p_mod, 4),
        "edge": round(edge, 4),
        "tailEvent": is_tail,
        "trace": {
            "ruleComputation": rule_computation,
            "baseRateContext": base_rate_context,
            "qualitativeTemplate": qualitative_template,
            "falsifiers": tpl["falsifiers"],
        },
    }


def update_forward_ledger(ledger_path: Path, markets: list, updated_at: str) -> dict:
    """
    Maintain append-only forward ledger starting 26 Nov 2026.
    Never modifies existing logged probabilities; only appends unseen contracts.
    """
    if ledger_path.exists():
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    else:
        ledger = {
            "schemaVersion": "1.0",
            "startDate": "2026-11-26",
            "startDateLabel": "26 Nov 2026",
            "ruleId": RULE_SPEC["id"],
            "ruleFormula": RULE_SPEC["formula"],
            "appendOnly": True,
            "entries": [],
        }

    existing_ids = {e["id"] for e in ledger.get("entries", [])}
    for m in markets:
        if m["id"] not in existing_ids:
            ledger["entries"].append({
                "id": m["id"],
                "question": m["question"],
                "domain": m["domain"],
                "url": m["url"],
                "loggedAt": updated_at,
                "closeDate": m["closeDate"],
                "marketProbAtLog": m["marketProb"],
                "modelProbAtLog": m["modelProb"],
                "status": "open",
                "resolution": None,
                "resolvedAt": None,
            })
            existing_ids.add(m["id"])

    resolved_count = sum(1 for e in ledger["entries"] if e.get("status") == "resolved")
    open_count = sum(1 for e in ledger["entries"] if e.get("status") == "open")
    ledger["resolvedCount"] = resolved_count
    ledger["openCount"] = open_count
    ledger["summary"] = f"Track record starts {ledger['startDateLabel']}; {resolved_count} resolved"

    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    return {
        "startDate": ledger["startDate"],
        "startDateLabel": ledger["startDateLabel"],
        "resolvedCount": resolved_count,
        "openCount": open_count,
        "summary": ledger["summary"],
        "ledgerPath": "data/forward_ledger.json",
    }


def main():
    root = Path(__file__).resolve().parent.parent
    out_path = root / "public" / "data" / "markets.json"
    ledger_path = root / "data" / "forward_ledger.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    now_dt = datetime.now(timezone.utc)
    now_ms = int(now_dt.timestamp() * 1000)
    current_year = now_dt.year
    updated_at = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    print("Running build-time backtest on resolved Manifold binary markets...")
    backtest = run_resolved_backtest()
    print(
        f"Backtest complete: n={backtest['resolvedCount']} ({backtest['window']}), "
        f"Model Brier={backtest['overall']['brierScore']:.4f} vs Market={backtest['overall']['marketBrierScore']:.4f} "
        f"(Skill {backtest['overall']['brierSkillPct']:+.2f}%), "
        f"Tail (<15%/>85%, n={backtest['overall']['tailEventCount']}): "
        f"Model={backtest['overall']['tailBrierScore']} vs Market={backtest['overall']['marketTailBrierScore']}"
    )

    print("Fetching live non-expired Manifold binary markets...")
    selected, mode, live_count = fetch_live_markets(now_ms, current_year)
    markets = [
        build_live_market_record(m, dom, backtest["byDomain"][dom], i)
        for i, (dom, m) in enumerate(selected)
    ]

    forward_ledger = update_forward_ledger(ledger_path, markets, updated_at)

    avg_abs_edge = round(sum(abs(m["edge"]) for m in markets) / len(markets), 4) if markets else 0.0
    tail_active = sum(1 for m in markets if m["tailEvent"])
    total_liquidity = round(sum(m["liquidity"] for m in markets), 1)

    payload = {
        "updated_at": updated_at,
        "meta": {
            "title": "Calibrated Forecasting Engine",
            "version": "3.0.0",
            "author": "Mohammed KM",
            "generatedAt": updated_at,
            "updated_at": updated_at,
            "refreshSchedule": "weekly automated refresh",
            "dataMode": mode,
            "liveMarketsCount": live_count,
            "totalMarkets": len(markets),
            "activeTailMarkets": tail_active,
            "avgAbsEdge": avg_abs_edge,
            "totalLiquidity": total_liquidity,
            "sourceEndpoint": f"{BASE_URL}/markets",
        },
        "rule": RULE_SPEC,
        "forwardLedger": forward_ledger,
        "backtest": backtest,
        "markets": markets,
    }

    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(markets)} live markets ({live_count} live) and backtest (n={backtest['resolvedCount']}) to {out_path}")
    print(f"Updated append-only forward ledger at {ledger_path}: {forward_ledger['summary']} ({forward_ledger['openCount']} open tracked)")


if __name__ == "__main__":
    main()
