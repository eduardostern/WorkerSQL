export const metadata = {
  title: 'Notes App - WorkerSQL Demo',
  description: 'A simple notes app built with WorkerSQL and Next.js',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
