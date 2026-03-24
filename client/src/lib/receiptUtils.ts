import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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

export async function printReceipt(html: string, fileName?: string) {
  const prevTitle = document.title;
  if (fileName) document.title = fileName.replace(/\.[^.]+$/, "");

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch {}
    document.title = prevTitle;
  };
  window.addEventListener("afterprint", cleanup, { once: true });

  await new Promise<void>(resolve => setTimeout(resolve, 300));
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  setTimeout(cleanup, 5000);
}

function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const pageImgH = (usableH / imgW) * canvas.width;

  if (imgH <= usableH) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, imgH);
  } else {
    const pages = Math.ceil(imgH / usableH);
    for (let p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage();
      const srcY = p * pageImgH;
      const srcH = Math.min(pageImgH, canvas.height - srcY);
      const sc = document.createElement("canvas");
      sc.width = canvas.width;
      sc.height = srcH;
      sc.getContext("2d")?.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      pdf.addImage(sc.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, (srcH * imgW) / canvas.width);
    }
  }
  return pdf.output("blob");
}

export type BidCropSection = {
  crop: string;
  groups: Array<{ serialNumber: number; farmerName: string; village: string; totalBags: number; lotBags: number; cardTotalBags: number }>;
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function generateBidCopyHtml(
  cropSections: BidCropSection[],
  businessName: string,
  date: string
): string {
  function getBidRows(bags: number): number {
    if (bags <= 10) return 1;
    if (bags <= 50) return 2;
    if (bags <= 150) return 3;
    return 4;
  }

  const tdStyle = "border:1px solid #333;padding:5px 7px;";
  const thStyle = "border:1px solid #333;padding:5px 7px;background:#e8e8e8;font-weight:600;font-size:10.5px;";

  const sections = cropSections.map(({ crop, groups }) => {
    const sortedGroups = [...groups].sort((a, b) => a.serialNumber - b.serialNumber);

    const bodyRows = sortedGroups.map(g => {
      const rowCount = getBidRows(g.totalBags);
      const farmerLabel = g.village ? `${escHtml(g.farmerName)}<br><span style="font-size:9.5px;color:#555;">${escHtml(g.village)}</span>` : escHtml(g.farmerName);
      const firstRow = `<tr style="border-top:2.5px solid #444;">
        <td rowspan="${rowCount}" style="${tdStyle}text-align:center;font-weight:700;vertical-align:middle;">${g.serialNumber}</td>
        <td rowspan="${rowCount}" style="${tdStyle}vertical-align:middle;">${farmerLabel}</td>
        <td rowspan="${rowCount}" style="${tdStyle}text-align:center;vertical-align:middle;">${g.cardTotalBags}/${g.lotBags}</td>
        <td rowspan="${rowCount}" style="${tdStyle}text-align:center;vertical-align:middle;">${g.totalBags}</td>
        <td style="${tdStyle}min-width:60px;"></td>
        <td style="${tdStyle}text-align:center;width:55px;"></td>
        <td style="${tdStyle}text-align:center;width:45px;"></td>
        <td style="${tdStyle}text-align:center;width:65px;"></td>
        <td style="${tdStyle}min-width:80px;"></td>
      </tr>`;
      const extraRows = Array.from({ length: rowCount - 1 }, () =>
        `<tr>
          <td style="${tdStyle}"></td>
          <td style="${tdStyle}text-align:center;"></td>
          <td style="${tdStyle}text-align:center;"></td>
          <td style="${tdStyle}text-align:center;"></td>
          <td style="${tdStyle}"></td>
        </tr>`
      ).join("");
      const blankRow = `<tr style="border-top:1px dashed #bbb;">
        <td style="${tdStyle}color:#ccc;font-size:9px;text-align:center;"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
        <td style="${tdStyle}"></td>
      </tr>`;
      return firstRow + extraRows + blankRow;
    }).join("");

    return `<div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:600;">${escHtml(businessName)}</span>
        <span style="font-size:13px;font-weight:700;letter-spacing:0.3px;">CROP: ${escHtml(crop.toUpperCase())} &mdash; BID COPY</span>
        <span style="font-size:11px;">${date}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr>
            <th style="${thStyle}text-align:center;width:38px;">SR#</th>
            <th style="${thStyle}text-align:left;min-width:95px;">Farmer Name</th>
            <th style="${thStyle}text-align:center;width:55px;">Lot #</th>
            <th style="${thStyle}text-align:center;width:50px;">Rem. Bags</th>
            <th style="${thStyle}text-align:left;min-width:60px;">Buyer Name</th>
            <th style="${thStyle}text-align:center;width:55px;">Rate/Kg</th>
            <th style="${thStyle}text-align:center;width:45px;"># Bags</th>
            <th style="${thStyle}text-align:center;width:65px;">Cash/Credit</th>
            <th style="${thStyle}text-align:left;">Remarks</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div style="margin-top:10px;border-top:1px solid #aaa;padding-top:5px;font-size:10px;color:#555;">
        Notes / Signature: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      </div>
    </div>`;
  });

  const body = sections.join('<div style="page-break-before:always;"></div>');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: A4 portrait; margin: 10mm; }
body { margin:0; font-family:Arial,sans-serif; font-size:11px; color:#111; }
</style>
</head><body>${body}</body></html>`;
}

export async function shareReceiptAsImage(html: string, fileName: string): Promise<void> {
  const bodyHtml = extractBodyHtml(html);
  const headStyles = extractHeadStyles(html);

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:-9999px;z-index:-1;opacity:0;pointer-events:none;width:800px;";

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

    const pdfName = fileName.replace(/\.[^.]+$/, ".pdf");
    const pdfBlob = canvasToPdfBlob(canvas);
    const pdfFile = new File([pdfBlob], pdfName, { type: "application/pdf" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({ files: [pdfFile], title: pdfName }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pdfBlob);
      a.download = pdfName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } finally {
    try { document.body.removeChild(container); } catch {}
  }
}
