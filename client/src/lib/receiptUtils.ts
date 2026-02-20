import html2canvas from "html2canvas";
import jsPDF from "jspdf";

function createReceiptIframe(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "800px";
    iframe.style.height = "600px";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      reject(new Error("Could not access iframe document"));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => resolve(iframe), 500);
  });
}

export async function printReceipt(html: string) {
  const iframe = await createReceiptIframe(html);
  try {
    iframe.contentWindow?.print();
  } finally {
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch {}
    }, 2000);
  }
}

function buildPdf(canvas: HTMLCanvasElement): jsPDF {
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
  return pdf;
}

export async function shareReceiptAsPdf(html: string, pdfFileName: string): Promise<void> {
  const iframe = await createReceiptIframe(html);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc?.body) throw new Error("Could not access iframe content");

    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 800,
    });

    const pdfBlob = buildPdf(canvas).output("blob");
    const pdfFile = new File([pdfBlob], pdfFileName, { type: "application/pdf" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({ files: [pdfFile], title: pdfFileName }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pdfBlob);
      a.download = pdfFileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } finally {
    try { document.body.removeChild(iframe); } catch {}
  }
}
