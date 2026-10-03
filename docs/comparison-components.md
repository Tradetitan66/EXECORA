# Comparison components

The original project is a Vite multi-page HTML site with shared styles in `src/style.css`. React and TypeScript are now supported for the comparison page without migrating other pages.

- Shared React UI components: `components/ui/`
- Component demo: `components/demo.tsx`
- Utility helpers: `lib/utils.ts`
- Tailwind 4 component styles: `src/comparison.css`
- Comparison entry: `src/compare.tsx`
- Alias: `@/` points to the project root in Vite and TypeScript.

`components/ui` provides a predictable home for shadcn components and keeps the supplied imports and CLI aliases consistent. `components.json` configures the shadcn CLI to use this folder. The supplied Badge and Button are installed locally; no separate shadcn initialization is required.

To add another component, run `npx shadcn@latest add <component>`. For a new React/Vite project, follow https://ui.shadcn.com/docs/installation/vite and run `npx shadcn@latest init` after configuring Tailwind and the alias.

This integration installs React, React DOM, lucide-react, class-variance-authority, @radix-ui/react-slot, clsx, tailwind-merge, tailwindcss, @tailwindcss/vite, tw-animate-css, TypeScript and React type declarations. Tailwind uses the Vite plugin; preflight is omitted to preserve existing styles, and theme tokens are scoped to the comparison section.

Run `npm run typecheck` and `npm run build`. The build prerenders the React comparison into `dist/compare.html`; the browser hydrates the same component. The supplied Hirael example is adapted to the two Execora plans, keeping its MIT attribution. Mobile users can scroll the table horizontally.
