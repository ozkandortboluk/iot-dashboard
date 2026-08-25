sed -i "s/\/api\/customers/\/\/api\/admin\/tenants/g" src/components/CustomerDetailsModal.tsx
sed -i "s/\/status/\/suspend/g" src/components/CustomerDetailsModal.tsx
sed -i "s/method: 'PATCH'/method: 'POST'/g" src/components/CustomerDetailsModal.tsx
