import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/figtree'
import '@/assets/styles/tokens.css'
import '@/assets/styles/base.css'
import App from './App.vue'
import router, { redirectToLoginOnExpiry } from './router'
import { startAutoRefresh } from '@/services/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

startAutoRefresh()
redirectToLoginOnExpiry()

app.mount('#app')
