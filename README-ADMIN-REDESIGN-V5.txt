DOROKARTES ADMIN REDESIGN V5

Scope:
- Replaces only components/admin/AdminShell.tsx
- Adds app/admin/admin-v5.css, loaded last
- Does not touch public homepage, public CSS, merchant portal CSS, database or Prisma
- Keeps all existing admin routes and business logic
- Makes admin visually consistent with Merchant Portal V4: navy sidebar, light workspace, premium cards/tables, responsive mobile drawer

Install:
1. Extract over D:\dorokartes
2. node scripts/install-admin-redesign-v5.mjs
3. npm run build
