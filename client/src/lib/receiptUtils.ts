import html2canvas from "html2canvas";

function extractBodyHtml(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function extractHeadStyles(html: string): string {
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) {
    styles.push(m[1]);
  }
  return styles.join("\n");
}

export function wrapWithDuplicate(html: string, altHtml?: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : "";
  const bodyContent = extractBodyHtml(html);

  let altBodyContent = bodyContent;
  if (altHtml) {
    const altBodyMatch = altHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    altBodyContent = altBodyMatch ? altBodyMatch[1] : altHtml;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: A4 landscape; margin: 5mm; }
body { margin: 0; padding: 0; font-size: 11px; }
.duplex-row { display: flex; flex-direction: row; width: 100%; box-sizing: border-box; }
.copy-wrapper { width: 50%; box-sizing: border-box; padding: 4mm; page-break-inside: avoid; break-inside: avoid; overflow: hidden; }
.cut-separator { width: 0; border-left: 1px dashed #999; margin: 4mm 0; }
</style>
${headContent}
</head><body>
<div class="duplex-row">
<div class="copy-wrapper">${bodyContent}</div>
<div class="cut-separator"></div>
<div class="copy-wrapper">${altBodyContent}</div>
</div>
</body></html>`;
}

export async function printReceipt(html: string) {
  const bodyHtml = extractBodyHtml(html);
  const headStyles = extractHeadStyles(html);

  const container = document.createElement("div");
  container.id = "__receipt_print_container__";
  container.innerHTML = bodyHtml;
  document.body.appendChild(container);

  const style = document.createElement("style");
  style.id = "__receipt_print_style__";
  style.textContent = `
    ${headStyles}
    @media print {
      body > *:not(#__receipt_print_container__) { display: none !important; }
      #__receipt_print_container__ { display: block !important; }
    }
  `;
  document.head.appendChild(style);

  const cleanup = () => {
    try { document.body.removeChild(container); } catch {}
    try { document.head.removeChild(style); } catch {}
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 3000);
}

export async function shareReceiptAsImage(html: string, fileName: string): Promise<void> {
  const bodyHtml = extractBodyHtml(html);
  const headStyles = extractHeadStyles(html);

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:0;top:0;z-index:-1;opacity:0.01;pointer-events:none;width:800px;";

  if (headStyles) {
    const styleEl = document.createElement("style");
    styleEl.textContent = headStyles;
    container.appendChild(styleEl);
  }

  const bodyWrapper = document.createElement("div");
  bodyWrapper.innerHTML = bodyHtml;
  container.appendChild(bodyWrapper);

  document.body.appendChild(container);

  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const canvas = await html2canvas(bodyWrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 800,
    });

    const imageName = fileName.replace(/\.[^.]+$/, ".png");

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("Canvas toBlob failed")), "image/png");
    });

    const imageFile = new File([blob], imageName, { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
      await navigator.share({ files: [imageFile], title: imageName }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = imageName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } finally {
    try { document.body.removeChild(container); } catch {}
  }
}
