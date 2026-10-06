# Drive the page like a visitor: mouse-wheel notches, a touchpad swipe with momentum, arrow keys, scrollbar drag.
from playwright.sync_api import sync_playwright
import sys
w, h = map(int, (sys.argv[1] if len(sys.argv) > 1 else "1280x630").split("x"))
lang = sys.argv[2] if len(sys.argv) > 2 else "fi"
JS = """() => {
  const y = scrollY, H = innerHeight; let label = 'NOT ON A BLOCK';
  for (const id of ['top','services','how','build','projects','pricing','coverage','faq','contact']) {
    const el = document.getElementById(id); const top = el.getBoundingClientRect().top + y;
    const off = (id === 'top' || id === 'build') ? 0 : 80;
    if (Math.abs(y - (top - off)) < 3) label = id;
    if (id === 'build') for (let k = 1; k <= 4; k++) if (Math.abs(y - (top + k * 0.4 * H)) < 3) label = 'build stage ' + (k + 1);
  }
  if (Math.abs(y + H - document.documentElement.scrollHeight) < 3) label = 'page end (footer)';
  return Math.round(y) + ' ' + label;
}"""
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": w, "height": h})
    ctx.add_init_script(f"window.__realTween = true; try{{localStorage.setItem('tk_lang','{lang}')}}catch(e){{}}")
    pg = ctx.new_page(); pg.goto("http://localhost:3994/", wait_until="networkidle"); pg.wait_for_timeout(1500)
    pg.mouse.move(w / 2, h / 2)
    print("== mouse wheel, one notch at a time")
    for i in range(15):
        pg.mouse.wheel(0, 100); pg.wait_for_timeout(1300); print(" ", i + 1, pg.evaluate(JS))
    print("== wheel up x2"); 
    for i in range(2):
        pg.mouse.wheel(0, -100); pg.wait_for_timeout(1300); print(" ", pg.evaluate(JS))
    print("== touchpad swipe down with momentum tail (should move exactly one block)")
    pg.evaluate("window.scrollTo({top: 0, behavior: 'instant'})"); pg.wait_for_timeout(600)
    for d in [2, 6, 14, 30, 48, 60, 58, 50, 44, 38, 32, 27, 22, 18, 14, 11, 8, 6, 4, 3, 2, 1, 1]:
        pg.mouse.wheel(0, d); pg.wait_for_timeout(16)
    pg.wait_for_timeout(1500); print(" ", pg.evaluate(JS))
    print("== arrow keys")
    for k in ["ArrowDown", "ArrowDown", "PageDown", "ArrowUp"]:
        pg.keyboard.press(k); pg.wait_for_timeout(1300); print(" ", k, pg.evaluate(JS))
    print("== scrollbar-style jump to the middle of a block, then settle")
    pg.evaluate("(() => { const el = document.getElementById('pricing'); window.scrollTo({top: el.getBoundingClientRect().top + scrollY + 150, behavior: 'instant'}); })()")
    pg.wait_for_timeout(1500); print(" ", pg.evaluate(JS))
    print("== nav link click")
    pg.click("header a[href='#faq']"); pg.wait_for_timeout(2000); print(" ", pg.evaluate(JS))
    br.close()
