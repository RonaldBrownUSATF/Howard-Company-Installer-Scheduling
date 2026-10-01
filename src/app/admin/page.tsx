import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="shell">
      <AdminClient />
    </main>
  );
}
