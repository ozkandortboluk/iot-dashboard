sed -i 's/Eye,/Eye, Download, Settings, Edit3,/' src/components/CustomerManagement.tsx
sed -i '/import type { User } from/a import { CustomerDetailsModal } from "./CustomerDetailsModal";' src/components/CustomerManagement.tsx
