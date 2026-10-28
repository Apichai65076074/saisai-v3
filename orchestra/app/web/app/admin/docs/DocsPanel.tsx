'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DocRow } from '@/app/api/admin/docs/docs';

export default function DocsPanel({ initialDocs, lang }: { initialDocs: DocRow[]; lang: 'th' | 'en' }) {
  const en = lang === 'en';
  const [docs, setDocs] = useState(initialDocs);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  // While a file is being (re-)uploaded its old row must not keep showing a stale `ready`.
  const uploading = useRef<string | null>(null);
  const markUploading = (rows: DocRow[]): DocRow[] => rows.map(doc => doc.filename === uploading.current ? { ...doc, status: 'queued' } : doc);

  useEffect(() => {
    const abort = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/docs', { cache: 'no-store', signal: abort.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!abort.signal.aborted) setDocs(markUploading(data.docs));
      } catch {
        // A later poll retries transient connection failures.
      }
    };
    const timer = setInterval(refresh, 1000);
    return () => { abort.abort(); clearInterval(timer); };
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const file = new FormData(event.currentTarget).get('file');
    uploading.current = file instanceof File ? file.name : null;
    setDocs(markUploading);
    try {
      const response = await fetch('/api/admin/docs', { method: 'POST', body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0]?.message || (en ? 'Upload failed' : 'อัปโหลดไม่สำเร็จ'));
      setMessage(en ? 'Uploaded. Waiting for document processing.' : 'อัปโหลดแล้ว กำลังรอประมวลผลเอกสาร');
      formRef.current?.reset();
      uploading.current = null;
      const list = await fetch('/api/admin/docs', { cache: 'no-store' });
      if (list.ok) setDocs((await list.json()).docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : (en ? 'Please try again' : 'กรุณาลองอีกครั้ง'));
    } finally { uploading.current = null; setBusy(false); }
  }

  return <>
    <form ref={formRef} onSubmit={upload} className="card" style={{ marginBottom: 24 }}>
      <label htmlFor="doc-file">{en ? 'Upload PDF (up to 20 MB)' : 'อัปโหลด PDF (ไม่เกิน 20 MB)'}</label>
      <p className="muted">{en ? 'Uploading the same filename replaces the document.' : 'อัปโหลดชื่อไฟล์เดิมเพื่อแทนที่เอกสาร'}</p>
      <input id="doc-file" name="file" type="file" accept="application/pdf,.pdf" required data-testid="doc-upload-input" disabled={busy} />{' '}
      <button className="btn-primary" type="submit" data-testid="doc-upload-submit" disabled={busy}>
        {busy ? (en ? 'Uploading…' : 'กำลังอัปโหลด…') : (en ? 'Upload' : 'อัปโหลด')}
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
    <div style={{ overflowX: 'auto' }}>
      <table aria-label={en ? 'PDF documents' : 'เอกสาร PDF'}>
        <thead><tr><th>{en ? 'Filename' : 'ชื่อไฟล์'}</th><th>{en ? 'Pages' : 'หน้า'}</th><th>Chunks</th><th>{en ? 'Status' : 'สถานะ'}</th></tr></thead>
        <tbody>{docs.map(doc => <tr key={doc.id} data-testid="doc-row" data-filename={doc.filename} data-status={doc.status}>
          <td><a href={`/api/docs/${encodeURIComponent(doc.filename)}`} target="_blank" rel="noreferrer">{doc.filename}</a></td>
          <td>{doc.pages ?? '—'}</td><td>{doc.chunks}</td>
          <td><span className="badge">{doc.status}</span>{doc.error && <p className="error">{doc.error}</p>}</td>
        </tr>)}</tbody>
      </table>
      {docs.length === 0 && <p>{en ? 'No documents yet' : 'ยังไม่มีเอกสาร'}</p>}
    </div>
  </>;
}
