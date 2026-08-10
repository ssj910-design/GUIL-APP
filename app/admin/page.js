import AdminApp from "@/app/components/admin/AdminApp";
import { BRAND } from "@/lib/company";

export const metadata = { title: `${BRAND.name} 관리자` };

export default function AdminPage() {
  return <AdminApp />;
}
