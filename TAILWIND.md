# Tailwind CSS in this project

This project uses **Tailwind CSS** instead of LESS for all popup styling. This file is a short guide to how Tailwind works and how we use it here.

---

## What is Tailwind?

Tailwind is a **utility-first** CSS framework. Instead of writing custom CSS (or LESS) and naming classes like `.button-section` or `.extract-btn`, you apply small, single-purpose **utility classes** directly in your HTML.

| Old approach (LESS) | Tailwind approach |
|---------------------|--------------------|
| Define `.extract-btn { padding: 10px 16px; background: #007bff; ... }` in a stylesheet | Put `py-2.5 px-4 bg-primary text-white ...` on the `<button>` |
| One class = many properties | Many small classes = one property each |

**Benefits:** No need to invent class names, styles are co-located with the HTML, and Tailwind only includes the utilities you actually use (smaller CSS file).

---

## How we set it up

1. **Source file:** `src/input.css`  
   - Contains `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;`
   - Plus a small **components** layer for classes that JavaScript toggles (e.g. `.status-message.success`, `.tool-section.active`).

2. **Config:** `tailwind.config.js`  
   - `content`: tells Tailwind which files to scan for class names (so it only generates CSS for classes you use).
   - `theme.extend`: we added custom colors (`primary`, `success`, `danger`) to match the original design.

3. **Build:**  
   - Run: `npm run build:css`  
   - Reads `src/input.css`, scans `popup.html` / `popup.js` / `enrich.js`, and outputs **`popup.css`** (the file the extension loads).

4. **Development:**  
   - Run: `npm run watch:css` to rebuild CSS automatically when you change HTML/JS or `src/input.css`.

---

## Utility classes we use (quick reference)

- **Layout:** `flex`, `flex-col`, `gap-2`, `w-full`, `mb-4`, `p-5`, `px-4`, `py-2`
- **Typography:** `text-sm`, `text-xs`, `font-medium`, `font-semibold`, `text-gray-600`, `text-gray-800`
- **Colors:** `bg-primary`, `bg-success`, `text-primary`, `text-danger`, `bg-white`, `border-gray-300`
- **Borders:** `border`, `border-2`, `border-dashed`, `rounded`, `rounded-md`, `rounded-lg`
- **Interactivity:** `cursor-pointer`, `transition-colors`, `hover:bg-primary-hover`, `focus:outline-none`, `focus:ring-2`, `focus:ring-primary/10`
- **Display:** `hidden`, `block` (and in our component layer: `.tool-section.active` → `block`)
- **Sizing:** `w-[450px]`, `max-h-[480px]`, `max-h-[250px]` (arbitrary values)

**Custom theme colors** (from `tailwind.config.js`):

- `primary` / `primary-hover` (blue)
- `success` / `success-hover` (green)
- `danger` (red)

So you’ll see classes like `bg-primary`, `hover:bg-primary-hover`, `text-success`, `text-danger`.

---

## When we still use “component” classes

JavaScript in `popup.js` and `enrich.js` sets or toggles classes like:

- `status-message` + `success` / `error` / `loading`
- `tool-btn` + `active`
- `tool-section` + `active`
- `dropzone` + `dragover`
- `#errorToggleIcon` + `expanded`

Those class names are **kept** so the JS doesn’t need to change. Their styles are defined in `src/input.css` in the `@layer components { ... }` block using `@apply` and Tailwind utilities. So we get Tailwind’s design system even for JS-driven state.

---

## Summary

- **Edit** `popup.html` (and any new HTML) using Tailwind utility classes.
- **Edit** `src/input.css` for global/base styles and for component classes that JS toggles.
- **Run** `npm run build:css` (or `watch:css`) to regenerate `popup.css`.
- **Do not** edit `popup.css` by hand; it is generated. Don’t use `popup.less` anymore; styling is now Tailwind + `src/input.css`.
