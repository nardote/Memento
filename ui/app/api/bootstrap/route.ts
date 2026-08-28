export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    a: process.env.MEMENTO_A_TOKEN || '',
    b: process.env.MEMENTO_B_TOKEN || '',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
