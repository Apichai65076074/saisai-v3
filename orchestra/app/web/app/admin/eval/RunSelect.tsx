'use client';
// ช่องเลือก run (eval-run-select) / run ที่เทียบ (eval-compare-select) · เปลี่ยนค่า = เปลี่ยน query string ของหน้า
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Opt = { id: number; label: string; rerank: string };

export default function RunSelect({ param, value, options, testId, label, none }: {
  param: 'run' | 'compare'; value: number | null; options: Opt[]; testId: string; label: string; none?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function change(v: string) {
    const q = new URLSearchParams(sp.toString());
    if (v) q.set(param, v);
    else q.set(param, 'none');
    if (param === 'run') q.delete('compare'); // เลือก run ใหม่ → จับคู่ run เทียบใหม่อัตโนมัติ
    router.push(`${pathname}?${q.toString()}`);
  }
  return (
    <label className="eval-select">
      <span>{label}</span>
      <select data-testid={testId} value={value ?? ''} onChange={(e) => change(e.target.value)}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            #{o.id} · {o.label} · rerank {o.rerank}
          </option>
        ))}
      </select>
    </label>
  );
}
