# Wird im Composio-Workbench ausgeführt (proxy_execute vorhanden).
# Veröffentlicht einen LinkedIn-Post mit Medium und liefert die Post-URN.
import re, urllib.parse
import requests as _rq

H = {"LinkedIn-Version": "202611", "X-Restli-Protocol-Version": "2.0.0"}
AUTHOR = "urn:li:person:RtJzVQrZIu"

if not hasattr(_rq, "_orig_post"):
    _rq._orig_post = _rq.post

    def _cap(*a, **k):
        resp = _rq._orig_post(*a, **k)
        try:
            _rq._last = resp.json()
        except Exception:
            _rq._last = None
        return resp

    _rq.post = _cap


def esc(t):
    """LinkedIn Little Text Format: Sonderzeichen escapen, Hashtags als Hashtag-Element."""
    out = []
    for tok in re.split(r"(#[A-Za-zÄÖÜäöüß0-9]+)", t):
        if tok.startswith("#") and len(tok) > 1:
            out.append("{hashtag|\\#|" + tok[1:] + "}")
        else:
            out.append(re.sub(r"([\\|{}@\[\]()<>#*_~])", r"\\\1", tok))
    return "".join(out)


def publish(text, media, draft=False):
    body = {
        "author": AUTHOR,
        "commentary": esc(text),
        "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "DRAFT" if draft else "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if media:
        body["content"] = {"media": media}
    r, e = proxy_execute("POST", "https://api.linkedin.com/rest/posts", "linkedin", body=body, headers=H)
    last = getattr(_rq, "_last", None) or {}
    hd = {k.lower(): v for k, v in (last.get("headers") or {}).items()}
    return hd.get("x-restli-id"), e, last.get("status")


def media_status(urn):
    kind = urn.split(":")[2]
    r, e = proxy_execute("GET", f"https://api.linkedin.com/rest/{kind}s/{urllib.parse.quote(urn, safe='')}", "linkedin", headers=H)
    return (r or {}).get("status") if isinstance(r, dict) else None, e
