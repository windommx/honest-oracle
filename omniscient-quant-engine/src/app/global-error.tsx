'use client';

/** ข้อผิดพลาดระดับ layout (หน้าโหลดไม่ขึ้นทั้งหน้า) — ต้องมี <html>/<body> ของตัวเอง */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, background: '#09090b', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>
        <main role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20 }}>ระบบแสดงผลไม่สำเร็จ</h1>
            <p style={{ fontSize: 14, color: '#d4d4d8' }}>ลองโหลดใหม่อีกครั้ง ถ้ายังเกิดซ้ำให้แจ้งผู้ดูแลพร้อมรหัสด้านล่าง</p>
            {error.digest && <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#a1a1aa' }}>รหัส: {error.digest}</p>}
            <button type="button" onClick={reset} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #52525b', background: 'transparent', color: '#f4f4f5' }}>
              ลองอีกครั้ง
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
