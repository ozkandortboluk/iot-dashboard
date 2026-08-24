cat << 'INNER_EOF' >> src/utils/csvExport.ts
import { User } from '../types';

export function exportCustomersToCSV(customers: User[]) {
  const headers = ['ID', 'Ad', 'Firma', 'E-posta', 'Telefon', 'Rol', 'Durum', 'Kayıt Tarihi'];
  const rows = customers.map(c => [
    c.id,
    c.name,
    c.companyName || '-',
    c.email,
    c.phone || '-',
    c.role,
    c.status === 'suspended' ? 'Askida' : 'Aktif',
    new Date(c.created_at).toLocaleDateString()
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => \`"\${cell}"\`).join(','))
  ].join('\\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', \`musteriler_\${new Date().toISOString().split('T')[0]}.csv\`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
INNER_EOF
