export function page(title: string, body: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body{font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:#0b0f17; color:#e6e8ee; margin:0}
      .wrap{max-width:860px;margin:0 auto;padding:28px}
      .card{background:#111827;border:1px solid #1f2937;border-radius:14px;padding:20px}
      .row{display:flex;gap:12px;flex-wrap:wrap}
      .muted{color:#9ca3af;font-size:13px}
      input{background:#0b1220;border:1px solid #243046;color:#e6e8ee;padding:10px 12px;border-radius:10px;min-width:260px}
      button{background:#2563eb;border:0;color:#fff;padding:10px 14px;border-radius:10px;cursor:pointer}
      button.secondary{background:#111827;border:1px solid #374151}
      code{background:#0b1220;border:1px solid #243046;padding:2px 6px;border-radius:6px}
      .kv{display:grid;grid-template-columns:160px 1fr;gap:8px 10px;margin-top:14px}
      .kv div{padding:6px 0;border-bottom:1px dashed #223044}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        ${body}
      </div>
    </div>
  </body>
</html>`;
}

export function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


