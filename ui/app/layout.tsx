import type { Metadata } from 'next';
import './globals.css';
import './conversation.css';

export const metadata: Metadata = {
  title: 'Memento Console',
  description: 'Panel local para administrar nodos Memento.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
