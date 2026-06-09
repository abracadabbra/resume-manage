import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'
import { safeHtmlDirective } from '@/directives/safeHtml'

const app = createApp(App)

app.use(createPinia())
app.directive('safe-html', safeHtmlDirective)

app.mount('#app')
