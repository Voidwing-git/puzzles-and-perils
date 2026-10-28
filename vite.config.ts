import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const owlbearCors = { origin: 'https://www.owlbear.rodeo' };

export default defineConfig({
  base: './',
  envDir:false,
  envPrefix:[],
  server: { cors: owlbearCors },
  preview: { cors: owlbearCors },
  plugins: [{
    name: 'owlbear-manifest-paths',
    transformIndexHtml:{order:'post',handler(html,context){
      if(!context.bundle)return html;
      return{html,tags:[
        {tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'self' blob:"},injectTo:'head-prepend'},
        {tag:'meta',attrs:{name:'referrer',content:'no-referrer'},injectTo:'head-prepend'},
      ]};
    }},
    generateBundle() {
      // Owlbear prefixes the manifest origin, rather than resolving relative
      // paths against the manifest URL. Emit absolute paths for the build base.
      const configuredBase = this.environment.config.base;
      const base = configuredBase.startsWith('/') ? configuredBase : '/';
      const manifest = JSON.parse(readFileSync(new URL('./public/manifest.json', import.meta.url), 'utf8'));
      manifest.icon = `${base}icon.svg`;
      if (manifest.action) {
        manifest.action.icon = `${base}icon.svg`;
        manifest.action.popover = `${base}index.html`;
      }
      manifest.background_url = `${base}background.html`;
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
    },
  }],
  build: {sourcemap:false,rollupOptions: { input: { main: 'index.html', background: 'background.html' } } },
});
