import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { Check, Copy, Download, Mail, MessageCircle, MessageSquare, Printer, Send, Share2 } from 'lucide-react';

/**
 * Copy / share a link: the phone's own share sheet (which offers Zalo,
 * WhatsApp, Messenger… whatever is installed), direct WhatsApp, Telegram,
 * SMS and email links, and a QR code to download or print.
 */
export default function ShareLink({ url, message, qrTitle, qrSubtitle }: { url: string; message: string; qrTitle: string; qrSubtitle?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const text = `${message} ${url}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: qrTitle, text: message, url });
    } catch {
      /* cancelled */
    }
  };

  const downloadQr = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'facilitypro-join-qr.png';
    a.click();
  };

  const printQr = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    w.document.write(
      `<!doctype html><title>${esc(qrTitle)}</title><body style="font-family:Arial,sans-serif;text-align:center;padding:48px">` +
        `<h1 style="font-size:28px;margin:0 0 8px">${esc(qrTitle)}</h1>` +
        (qrSubtitle ? `<p style="font-size:18px;color:#374151;margin:0 0 24px">${esc(qrSubtitle)}</p>` : '') +
        `<img src="${canvas.toDataURL('image/png')}" style="width:320px;height:320px" alt="">` +
        `<p style="font-size:14px;color:#6b7280;margin-top:16px;word-break:break-all">${esc(url)}</p>` +
        `<script>window.onload=()=>{window.print()}</script></body>`,
    );
    w.document.close();
  };

  const channel = 'flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-surface';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
        <code className="min-w-0 flex-1 truncate px-1 text-xs text-ink">{url}</code>
        <button type="button" onClick={() => void copy()} className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-600">
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? t('share.copied') : t('share.copy')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {canShare && (
          <button type="button" onClick={() => void share()} className={`${channel} col-span-2`}>
            <Share2 size={16} aria-hidden /> {t('share.more')}
          </button>
        )}
        <a className={channel} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={16} aria-hidden /> WhatsApp
        </a>
        <a className={channel} href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          <Send size={16} aria-hidden /> Telegram
        </a>
        <a className={channel} href={`sms:?&body=${encodeURIComponent(text)}`}>
          <MessageSquare size={16} aria-hidden /> SMS
        </a>
        <a className={channel} href={`mailto:?subject=${encodeURIComponent(qrTitle)}&body=${encodeURIComponent(text)}`}>
          <Mail size={16} aria-hidden /> {t('share.email')}
        </a>
      </div>
      {!canShare && <p className="text-xs text-ink-muted">{t('share.zaloHint')}</p>}

      <div className="flex flex-col items-center gap-3 rounded-xl border border-line p-4">
        <QRCodeCanvas ref={canvasRef} value={url} size={180} marginSize={2} />
        <div className="flex gap-2">
          <button type="button" onClick={downloadQr} className={channel}>
            <Download size={16} aria-hidden /> {t('share.downloadQr')}
          </button>
          <button type="button" onClick={printQr} className={channel}>
            <Printer size={16} aria-hidden /> {t('share.printQr')}
          </button>
        </div>
      </div>
    </div>
  );
}
