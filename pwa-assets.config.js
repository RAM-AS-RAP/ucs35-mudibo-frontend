import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icons in public/ from one SVG source (a placeholder leaf mark).
// Run `npm run gen:icons` after changing public/favicon.svg and commit the PNG and ICO files.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#1B5E3B' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#1B5E3B' } },
  },
  images: ['public/favicon.svg'],
});
