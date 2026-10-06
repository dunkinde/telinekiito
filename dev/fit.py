# For each desktop size and language: does every block fit in one screen?
from playwright.sync_api import sync_playwright
import sys
sizes = [tuple(map(int, s.split("x"))) for s in sys.argv[1].split(",")]
langs = sys.argv[2].split(",")
JS = """() => {
  const H = innerHeight, out = {};
  const ids = ['top','services','how','build','projects','pricing','coverage','faq','contact'];
  for (const id of ids) {
    const s = document.getElementById(id);
    if (id === 'build') {
      const panel = s.querySelector('.sticky');
      const grid = panel.firstElementChild;
      const cs = getComputedStyle(panel);
      const room = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      out[id] = Math.round(grid.scrollHeight - room);
      continue;
    }
    const target = id === 'top' ? H : H - 80;
    out[id] = Math.round(s.offsetHeight - target);
  }
  return out;
}"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in langs:
        for w, h in sizes:
            ctx = br.new_context(viewport={"width": w, "height": h})
            ctx.add_init_script(f"try{{localStorage.setItem('tk_lang','{lang}')}}catch(e){{}}")
            pg = ctx.new_page(); pg.goto("http://localhost:3994/", wait_until="networkidle"); pg.wait_for_timeout(500)
            r = pg.evaluate(JS)
            bad = {k: v for k, v in r.items() if v > 1}
            print(f"{lang} {w}x{h}: " + ("all fit" if not bad else "TOO TALL " + ", ".join(f"{k}+{v}px" for k, v in bad.items())))
            ctx.close()
    br.close()
