import { getSession } from "@/lib/session";
import AdminShell from "@/components/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <AdminShell userName={session?.name ?? ""} role={session?.role ?? "staff"}>
      {children}
    </AdminShell>
  );
}
