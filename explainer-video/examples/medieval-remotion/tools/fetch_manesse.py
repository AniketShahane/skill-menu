"""Download Codex Manesse miniatures from Wikimedia Commons (public domain artwork), with license + source notes."""
import json, time, urllib.parse, urllib.request, urllib.error
UA = {"User-Agent": "medieval-mind-video/0.1 (personal non-commercial explainer)"}
def get(url):
    for i in range(8):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(20 * (i + 1))
    raise SystemExit("rate limited")
from pathlib import Path
UA0 = {"User-Agent": "medieval-mind-video/0.1 (personal non-commercial explainer; contact via Commons)"}
FILES = {
 "walther": "File:Codex Manesse Walther von der Vogelweide.jpg",
 "veldeke": "File:Codex Manesse Heinrich von Veldeke.jpg",
 "altstetten": "File:Codex Manesse.jpg",
 "frauenlob": "File:Codex Manesse Heinrich von Meißen (Frauenlob).jpg",
 "warte": "File:Codex Manesse 046v Jakob von Warte.jpg",
 "fiedler": "File:Codex Manesse 312r Reinmar der Fiedler.jpg",
 "goeli": "File:Codex Manesse 262v Herr Goeli.jpg",
 "toggenburg": "File:Kraft von Toggenburg.jpg",
 "kaiser": "File:Codex Manesse 6r Kaiser Heinrich.png",
 "hiltbolt": "File:Meister der Manessischen Liederhandschrift 003.jpg",
}
out = Path("public/manesse"); meta = {}
for k, f in FILES.items():
    q = urllib.parse.urlencode({"action": "query", "titles": f, "prop": "imageinfo", "iiprop": "url|extmetadata|size",
                                "iiurlwidth": 1600, "format": "json"})
    d = json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))
    page = next(iter(d["query"]["pages"].values()))
    ii = page["imageinfo"][0]; em = ii.get("extmetadata", {})
    url = ii.get("thumburl") or ii["url"]
    dst = out / f"{k}.jpg"
    if not dst.exists():
        dst.write_bytes(get(url))
    meta[k] = {"file": f, "page": ii.get("descriptionurl"), "license": em.get("LicenseShortName", {}).get("value"),
               "desc": em.get("ImageDescription", {}).get("value", "")[:200], "size": [ii["width"], ii["height"]]}
    print(k, meta[k]["license"], meta[k]["size"], meta[k]["desc"][:90].replace("\n", " "))
    time.sleep(6)
(out / "SOURCES.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
