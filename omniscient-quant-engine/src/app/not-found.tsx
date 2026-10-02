import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-200">
      <div className="max-w-md space-y-3 text-center">
        <p className="font-mono text-sm text-zinc-400">404</p>
        <h1 className="text-xl font-semibold text-zinc-50">ไม่พบหน้าที่ต้องการ</h1>
        <p className="text-sm text-zinc-300">ลิงก์อาจผิดหรือหน้านี้ถูกย้ายแล้ว — ทุกมุมมองของแพลตฟอร์มอยู่ในหน้าหลัก</p>
        <Link href="/" className="inline-block rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800">
          กลับหน้าหลัก
        </Link>
      </div>
    </main>
  );
}
