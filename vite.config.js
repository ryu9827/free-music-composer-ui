import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
	base: '/free-music-composer-ui/',
	plugins: [react()],
})
