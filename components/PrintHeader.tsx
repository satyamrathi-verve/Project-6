/*
  Shown only when printing (browser Print → Save as PDF), so every exported
  report carries the Verve Advisory brand. Hidden on screen.
*/
export function PrintHeader({ title }: { title: string }) {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="mb-6 hidden items-center justify-between border-b border-slate-300 pb-4 print:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/verve-logo.png" alt="Verve Advisory" width={140} height={69} className="h-10 w-auto" />
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">Generated {today}</p>
      </div>
    </div>
  );
}
