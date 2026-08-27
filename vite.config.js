import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

//folds the emitted css asset into the js entry (runtime <style> injection):
//CS-Cart's output pipeline drops raw <link> tags added from script hooks,
//so the widget must be a single self-contained js file
function inlineCss() {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const cssKey = Object.keys(bundle).find(k => k.endsWith('.css'))
      if (!cssKey) return
      const css = bundle[cssKey].source
      delete bundle[cssKey]
      const entry = Object.values(bundle).find(c => c.type === 'chunk' && c.isEntry)
      entry.code = "(function(){var s=document.createElement('style');s.textContent="
        + JSON.stringify(css) + ";document.head.appendChild(s);})();\n" + entry.code
    },
  }
}

//builds the fullscreen overlay widget into the addon's js dir:
//  js/addons/nl_cito/widget.js
export default defineConfig({
  plugins: [vue(), inlineCss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    lib: {
      entry: 'src/main.js',
      name: 'CitoWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    outDir: '../js/addons/nl_cito',
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: { assetFileNames: 'widget.[ext]' },
    },
  },
})
