import { defineConfig } from 'vite';
export default defineConfig({ server:{host:'127.0.0.1',port:3100,strictPort:true,headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}},worker:{format:'es'},build:{target:'es2022',chunkSizeWarningLimit:1600},test:{include:['tests/**/*.test.ts']}});
