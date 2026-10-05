/*
 * A tiny in-page bridge for QA.
 *
 * The driver runs in an isolated world, so it can neither read the
 * app's globals nor call anything defined in the main world. This
 * file is served and loaded INTO the page, and it does the reading
 * instead: the driver drops a request into a DOM node, this watches
 * for it, evaluates the request against the app's own globals, and
 * writes the JSON answer into the response node.
 */
(function () {
  "use strict";

  if (window.__qa) return;

  function nodes() {
    return {
      req: document.getElementById("__qa_req"),
      res: document.getElementById("__qa_res")
    };
  }

  function handle() {
    const { req, res } = nodes();
    if (!req || !res) return;

    const payload = req.textContent;
    if (!payload) return;

    req.textContent = "";

    try {
      const { src, arg } = JSON.parse(payload);
      const fn = eval("(" + src + ")");
      res.textContent = JSON.stringify({
        ok: true,
        out: arg === null ? fn() : fn(arg)
      });
    } catch (e) {
      res.textContent = JSON.stringify({
        ok: false,
        error: String((e && e.message) || e)
      });
    }
  }

  window.__qa = {
    handle,
    get globals() {
      return Object.keys(window).filter(k => /^engg/i.test(k));
    }
  };

  // Watch the request node so the driver only has to write to it.
  const start = () => {
    const { req } = nodes();
    if (!req) return false;
    new MutationObserver(handle).observe(req, {
      childList: true,
      characterData: true,
      subtree: true
    });
    handle();
    return true;
  };

  if (!start()) {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
