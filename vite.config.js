import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: 22869,
		hmr: {
			protocol: 'ws',
			host: 'localhost',
			port: 24678
		}
	},
	build: {
		outDir: '../backend/public',
		emptyOutDir: true
	}
})
