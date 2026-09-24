# Third-party artwork

The module illustrations on the sign-in screen are from **unDraw**
(https://undraw.co), by Katerina Limpitsouni.

- **Licence:** open — free for commercial and non-commercial use, no
  attribution required. The credit here is given because it is owed.
- **Source:** vendored from the MIT-licensed `undraw-svg` package
  (https://www.npmjs.com/package/undraw-svg), © Evo Mark Ltd.
- **Where they live:** inlined and recoloured in
  `src/components/layout/module-illustrations.tsx`. They are inlined rather
  than served as files because they are repainted with the application's own
  theme tokens at render time, which an `<img>` cannot do — an SVG referenced
  by `<img>` is a separate document and cannot see this page's CSS variables.

To add or replace one, take the SVG from that package, prefix its element ids,
and map its palette the way the header of `module-illustrations.tsx` describes.
