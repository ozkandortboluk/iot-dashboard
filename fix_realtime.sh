sed -i "s/fetch('\/api\/customers'/fetch('\/api\/admin\/tenants'/g" src/context/RealtimeContext.tsx
sed -i "s/fetch(\`\/api\/customers\/\${id}\`, { method: 'DELETE' });/fetch(\`\/api\/admin\/tenants\/\${id}\/suspend\`, { method: 'POST' });/g" src/context/RealtimeContext.tsx
