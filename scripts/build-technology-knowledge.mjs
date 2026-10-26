/** Build the companion study document from preserved, reviewed content. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export function buildTechnologyKnowledge(root) {
  const data = JSON.parse(
    readFileSync(
      resolve(root, "docs/presentation/technology-knowledge.json"),
      "utf8",
    ),
  );
  const escape = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const links = data.sections
    .map((section) => `<a href="#${section.id}">${escape(section.title)}</a>`)
    .join("");
  const sections = data.sections
    .map(
      (section) =>
        `<section id="${section.id}"><h2>${escape(section.title)}</h2><ul>${section.content.map((text) => `<li>${escape(text)}</li>`).join("")}</ul><details open><summary>Lời thuyết trình, code và giới hạn</summary><p>${escape(section.notes)}</p></details></section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Sổ tay công nghệ ExaMate: kiến thức, lý do chọn, đánh đổi, lời nói và code; nội dung chi tiết tách khỏi slide trực quan."><title>ExaMate — Sổ tay công nghệ</title><style>
  :root{font:16px/1.75 'Segoe UI',Arial,sans-serif;color:#191b1e;background:#efefeb}*{box-sizing:border-box}body{margin:0}a{color:#365b54}a:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid #b78900;outline-offset:4px}.layout{display:grid;grid-template-columns:235px minmax(0,1fr);gap:2rem;max-width:1150px;margin:auto;padding:2rem 1.2rem}nav{position:sticky;top:1rem;align-self:start;display:grid;gap:.5rem;max-height:90vh;overflow:auto}nav a{font-size:.8rem;text-decoration:none;padding:.35rem}main{background:white;padding:2.4rem;min-width:0}h1{line-height:1.2;font-size:2.2rem}h2{font-size:1.5rem;line-height:1.4}section{padding-top:1.5rem;margin-top:2rem;border-top:3px solid #f7e54b}li{margin:.65rem 0}details{border-left:3px solid #f7e54b;background:#f6f6f2;padding:1rem}summary{cursor:pointer;font-weight:600}label{display:block;font-weight:600;margin-top:1.5rem}input{width:100%;padding:.7rem;font:inherit;border:1px solid #777}.note{background:#f7e54b33;padding:1rem}.small{font-size:.85rem;color:#555}footer{margin-top:2rem;font-size:.8rem;color:#555}[hidden]{display:none!important}@media(max-width:800px){.layout{display:block;padding:.7rem}nav{position:static;max-height:none;margin-bottom:1rem;grid-template-columns:1fr 1fr}main{padding:1.2rem}}@media print{nav,.search{display:none}.layout{display:block;padding:0}main{padding:0}details{break-inside:avoid}section{break-before:auto}}
  </style></head><body><div class="layout"><nav aria-label="Mục lục công nghệ">${links}</nav><main><header><p class="small">EXAMATE · KIẾN THỨC CÔNG NGHỆ · TÀI + THẮNG</p><h1>Hiểu sâu để trình bày gọn.</h1><p class="note">Giữ phần giải thích đầy đủ từ bản slide tại ${escape(data.sourceCheckpoint)}: công nghệ làm gì, vì sao chọn, đánh đổi, flow code và lời thuyết trình. Slide mới dành chỗ cho hình và tương tác; kiến thức không bị lược bỏ.</p><p><a href="ExaMate-Technologies-VI-20261026.html">Mở slide trực quan ↗</a> · <a href="../EXAMATE-ON-TAP-VAN-DAP.html">68 câu ôn vấn đáp ↗</a></p><section class="search" aria-label="Tìm kiến thức"><label for="q">Tìm công nghệ, lý do hoặc tên file</label><input type="search" id="q" aria-controls="knowledge"><p id="status" role="status" aria-live="polite"></p></section></header><article id="knowledge">${sections}</article><footer>Nguồn nội dung: source ${escape(data.sourceCheckpoint)} và bằng chứng lịch sử đã ghi. Không chạy lại model/app/DB để tạo tài liệu. Schema/citation không chứng minh chất lượng ngữ nghĩa; phần pending vẫn giữ đúng thực trạng.</footer></main></div><script>const input=document.querySelector('#q');const sections=[...document.querySelectorAll('#knowledge>section')];const norm=s=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/g,'d');function filter(){const terms=norm(input.value).trim().split(/\\s+/).filter(Boolean);let count=0;for(const s of sections){s.hidden=!terms.every(t=>norm(s.textContent).includes(t));if(!s.hidden)count++;}document.querySelector('#status').textContent=count+'/'+sections.length+' mục phù hợp.';}input.addEventListener('input',filter);filter();window.addEventListener('beforeprint',()=>{sections.forEach(s=>s.hidden=false);document.querySelectorAll('details').forEach(d=>d.open=true);});window.addEventListener('afterprint',filter);</script></body></html>`;
  const path = resolve(
    root,
    "docs/submission/ExaMate-Technologies-Knowledge-VI-20261026.html",
  );
  writeFileSync(path, html);
  return { path, html };
}
