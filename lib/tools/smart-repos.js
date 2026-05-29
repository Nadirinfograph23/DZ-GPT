export const SMART_REPOS = [
  {
    url: 'https://github.com/yt-dlp/yt-dlp',
    name: 'yt-dlp', owner: 'yt-dlp', category: 'media',
    descAr: 'تحميل الفيديوهات والصوت من YouTube وآلاف المواقع',
    install: { type: 'pip', pkg: 'yt-dlp' },
    keywords: ['يوتيوب', 'تحميل', 'فيديو', 'youtube', 'download', 'video', 'mp4', 'mp3', 'صوت', 'تنزيل', 'موقع تحميل', 'تطبيق تحميل'],
    starterFiles: {
      'requirements.txt': 'yt-dlp\nflask\nflask-cors\n',
      'app.py': `from flask import Flask, request, jsonify, send_file
import yt_dlp, os, tempfile

app = Flask(__name__)

@app.route('/info', methods=['POST'])
def get_info():
    url = request.json.get('url', '')
    with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
        info = ydl.extract_info(url, download=False)
        return jsonify({'title': info.get('title'), 'thumbnail': info.get('thumbnail'), 'duration': info.get('duration')})

@app.route('/download', methods=['POST'])
def download():
    url = request.json.get('url', '')
    fmt = request.json.get('format', 'mp4')
    tmp = tempfile.mkdtemp()
    opts = {'format': 'bestaudio/best' if fmt == 'mp3' else 'best[ext=mp4]', 'outtmpl': f'{tmp}/%(title)s.%(ext)s', 'quiet': True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filepath = ydl.prepare_filename(info)
        return send_file(filepath, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
`,
      'README.md': '# YouTube Downloader API\nBuilt with yt-dlp + Flask\n\n## Run\n```\npip install -r requirements.txt\npython app.py\n```\n',
    },
  },
  {
    url: 'https://github.com/FFmpeg/FFmpeg',
    name: 'FFmpeg', owner: 'FFmpeg', category: 'media',
    descAr: 'معالجة وتحويل وضغط الفيديو والصوت احترافياً',
    install: { type: 'npm', pkg: 'fluent-ffmpeg' },
    keywords: ['تحويل', 'ضغط', 'فيديو', 'صوت', 'encode', 'convert', 'compress', 'audio', 'ffmpeg', 'تحرير فيديو'],
    starterFiles: {
      'package.json': '{\n  "name": "ffmpeg-api",\n  "version": "1.0.0",\n  "dependencies": {\n    "fluent-ffmpeg": "^2.1.2",\n    "express": "^4.18.2",\n    "multer": "^1.4.5-lts.1"\n  }\n}\n',
      'server.js': `const express = require('express')
const ffmpeg = require('fluent-ffmpeg')
const multer = require('multer')
const app = express()
const upload = multer({ dest: 'uploads/' })

app.post('/convert', upload.single('file'), (req, res) => {
  const output = req.file.path + '.' + (req.body.format || 'mp4')
  ffmpeg(req.file.path).output(output)
    .on('end', () => res.download(output))
    .on('error', err => res.status(500).json({ error: err.message }))
    .run()
})

app.listen(3001, () => console.log('FFmpeg API running on :3001'))
`,
    },
  },
  {
    url: 'https://github.com/openai/whisper',
    name: 'Whisper', owner: 'openai', category: 'ai',
    descAr: 'تحويل الصوت إلى نص متعدد اللغات بدقة عالية',
    install: { type: 'pip', pkg: 'openai-whisper' },
    keywords: ['صوت', 'نص', 'تحويل', 'كلام', 'ترجمة', 'speech', 'transcribe', 'audio', 'text', 'تفريغ', 'تسجيل'],
    starterFiles: {
      'requirements.txt': 'openai-whisper\nflask\nflask-cors\n',
      'app.py': `import whisper
from flask import Flask, request, jsonify
app = Flask(__name__)
model = whisper.load_model("base")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    audio = request.files.get('audio')
    audio.save('/tmp/audio.mp3')
    result = model.transcribe('/tmp/audio.mp3')
    return jsonify({'text': result['text'], 'language': result['language']})

if __name__ == '__main__':
    app.run(debug=True, port=5002)
`,
    },
  },
  {
    url: 'https://github.com/SYSTRAN/faster-whisper',
    name: 'faster-whisper', owner: 'SYSTRAN', category: 'ai',
    descAr: 'نسخة Whisper أسرع بـ 4x وأقل استهلاكاً للذاكرة',
    install: { type: 'pip', pkg: 'faster-whisper' },
    keywords: ['صوت', 'نص', 'سريع', 'speech', 'fast', 'transcribe', 'تفريغ', 'تسجيل صوتي', 'كلام'],
    starterFiles: {
      'requirements.txt': 'faster-whisper\nflask\n',
      'app.py': `from faster_whisper import WhisperModel
from flask import Flask, request, jsonify
app = Flask(__name__)
model = WhisperModel("base", device="cpu", compute_type="int8")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    audio = request.files['audio']
    audio.save('/tmp/input.mp3')
    segments, info = model.transcribe('/tmp/input.mp3')
    return jsonify({'text': ' '.join([s.text for s in segments]), 'language': info.language})

if __name__ == '__main__':
    app.run(port=5002)
`,
    },
  },
  {
    url: 'https://github.com/ollama/ollama',
    name: 'Ollama', owner: 'ollama', category: 'ai',
    descAr: 'تشغيل نماذج الذكاء الاصطناعي محلياً بدون إنترنت',
    install: { type: 'npm', pkg: 'ollama' },
    keywords: ['نموذج', 'محلي', 'ذكاء', 'ai', 'llm', 'local', 'offline', 'llama', 'mistral', 'وكيل ذكاء', 'دردشة ذكية'],
    starterFiles: {
      'chat.js': `import { Ollama } from 'ollama'
const ollama = new Ollama({ host: 'http://localhost:11434' })
async function chat(prompt) {
  const response = await ollama.chat({ model: 'llama3.2', messages: [{ role: 'user', content: prompt }] })
  return response.message.content
}
chat('مرحبا، كيف يمكنك مساعدتي؟').then(console.log)
`,
    },
  },
  {
    url: 'https://github.com/langchain-ai/langchain',
    name: 'LangChain', owner: 'langchain-ai', category: 'ai',
    descAr: 'بناء وكلاء ذكاء اصطناعي وربط الأدوات والبيانات',
    install: { type: 'pip', pkg: 'langchain langchain-openai' },
    keywords: ['وكيل', 'ذكاء', 'chain', 'rag', 'agent', 'ai', 'llm', 'بيانات', 'استرجاع', 'بناء وكيل'],
    starterFiles: {
      'requirements.txt': 'langchain\nlangchain-openai\npython-dotenv\n',
      'agent.py': `from langchain_openai import ChatOpenAI
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """بحث في الويب"""
    return f"نتائج البحث عن: {query}"

llm = ChatOpenAI(model="gpt-4o-mini")
tools = [search_web]
print("LangChain Agent جاهز")
`,
    },
  },
  {
    url: 'https://github.com/vercel/next.js',
    name: 'Next.js', owner: 'vercel', category: 'web',
    descAr: 'إطار React الأكثر احترافيةً — SSR + SEO + Full-Stack',
    install: { type: 'npx', pkg: 'create-next-app@latest' },
    keywords: ['موقع', 'ويب', 'react', 'next', 'ssr', 'seo', 'full-stack', 'web', 'تطبيق ويب', 'موقع ويب', 'frontend'],
    starterFiles: {
      'README.md': '# Next.js Project\n\n```bash\nnpx create-next-app@latest my-app\ncd my-app && npm run dev\n```\n',
      'pages/index.js': `export default function Home() {
  return <main style={{padding:20}}><h1>مرحباً بك في مشروعي 🇩🇿</h1></main>
}
`,
    },
  },
  {
    url: 'https://github.com/socketio/socket.io',
    name: 'Socket.IO', owner: 'socketio', category: 'web',
    descAr: 'اتصال فوري في الوقت الحقيقي للدردشة والبث المباشر',
    install: { type: 'npm', pkg: 'socket.io' },
    keywords: ['دردشة', 'chat', 'real-time', 'فوري', 'websocket', 'live', 'broadcast', 'بث', 'محادثة', 'رسائل فورية', 'تطبيق دردشة'],
    starterFiles: {
      'package.json': '{\n  "name": "chat-app",\n  "version": "1.0.0",\n  "dependencies": {\n    "socket.io": "^4.7.2",\n    "express": "^4.18.2"\n  }\n}\n',
      'server.js': `const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const app = express()
const io = new Server(createServer(app), { cors: { origin: '*' } })
io.on('connection', (socket) => {
  socket.on('message', (msg) => io.emit('message', { id: socket.id, text: msg }))
})
app.listen(3000, () => console.log('Chat: http://localhost:3000'))
`,
    },
  },
  {
    url: 'https://github.com/expressjs/express',
    name: 'Express', owner: 'expressjs', category: 'web',
    descAr: 'إنشاء APIs وخوادم Node.js بسرعة وسهولة',
    install: { type: 'npm', pkg: 'express' },
    keywords: ['api', 'server', 'backend', 'node', 'rest', 'خادم', 'واجهة برمجية', 'route', 'endpoint', 'nodejs'],
    starterFiles: {
      'server.js': `const express = require('express')
const app = express()
app.use(express.json())
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.get('/api/hello', (req, res) => res.json({ message: 'مرحباً من DZ API 🇩🇿' }))
app.listen(3000, () => console.log('API: http://localhost:3000'))
`,
    },
  },
  {
    url: 'https://github.com/fastapi/fastapi',
    name: 'FastAPI', owner: 'fastapi', category: 'web',
    descAr: 'APIs سريعة بـ Python مع توثيق Swagger تلقائي',
    install: { type: 'pip', pkg: 'fastapi uvicorn' },
    keywords: ['python', 'api', 'fast', 'backend', 'rest', 'خادم', 'بايثون', 'واجهة', 'endpoint', 'swagger'],
    starterFiles: {
      'requirements.txt': 'fastapi\nuvicorn\n',
      'main.py': `from fastapi import FastAPI
app = FastAPI(title="DZ API 🇩🇿")

@app.get("/")
def root():
    return {"message": "مرحباً من FastAPI"}

@app.get("/api/items")
def items():
    return [{"id": 1, "name": "عنصر أول"}, {"id": 2, "name": "عنصر ثاني"}]
# uvicorn main:app --reload
`,
    },
  },
  {
    url: 'https://github.com/supabase/supabase',
    name: 'Supabase', owner: 'supabase', category: 'database',
    descAr: 'Backend مفتوح المصدر: قاعدة بيانات + مصادقة + تخزين ملفات',
    install: { type: 'npm', pkg: '@supabase/supabase-js' },
    keywords: ['قاعدة بيانات', 'database', 'auth', 'مصادقة', 'backend', 'storage', 'realtime', 'postgres', 'بيانات', 'firebase'],
    starterFiles: {
      'supabase.js': `import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
export async function getItems() {
  const { data, error } = await supabase.from('items').select('*')
  if (error) throw error
  return data
}
`,
      '.env.example': 'SUPABASE_URL=https://your-project.supabase.co\nSUPABASE_ANON_KEY=your-anon-key\n',
    },
  },
  {
    url: 'https://github.com/microsoft/playwright',
    name: 'Playwright', owner: 'microsoft', category: 'automation',
    descAr: 'أتمتة المتصفحات واختبار المواقع والـ Web Scraping',
    install: { type: 'npm', pkg: '@playwright/test' },
    keywords: ['scraping', 'automation', 'browser', 'test', 'اختبار', 'استخراج', 'بيانات', 'أتمتة', 'موقع', 'crawl'],
    starterFiles: {
      'scraper.js': `const { chromium } = require('@playwright/test')
async function scrape(url) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(url)
  const title = await page.title()
  const links = await page.$$eval('a', els => els.map(el => ({ text: el.innerText.trim(), href: el.href })).filter(l => l.text))
  await browser.close()
  return { title, links: links.slice(0, 20) }
}
scrape('https://echoroukonline.com').then(d => console.log(JSON.stringify(d, null, 2)))
`,
    },
  },
  {
    url: 'https://github.com/scrapy/scrapy',
    name: 'Scrapy', owner: 'scrapy', category: 'automation',
    descAr: 'Web Scraping احترافي وسريع بـ Python — مثالي للجزائر',
    install: { type: 'pip', pkg: 'scrapy' },
    keywords: ['scraping', 'python', 'بيانات', 'استخراج', 'crawl', 'spider', 'ويب', 'موقع', 'data', 'جمع بيانات'],
    starterFiles: {
      'requirements.txt': 'scrapy\n',
      'spider.py': `import scrapy
class DZSpider(scrapy.Spider):
    name = 'dz_spider'
    start_urls = ['https://echoroukonline.com']
    def parse(self, response):
        for article in response.css('article'):
            yield {'title': article.css('h2::text').get(), 'link': article.css('a::attr(href)').get()}
# scrapy runspider spider.py -o output.json
`,
    },
  },
  {
    url: 'https://github.com/tailwindlabs/tailwindcss',
    name: 'Tailwind CSS', owner: 'tailwindlabs', category: 'ui',
    descAr: 'تصميم واجهات احترافية وسريعة باستخدام Utility Classes',
    install: { type: 'npm', pkg: 'tailwindcss' },
    keywords: ['تصميم', 'css', 'ui', 'واجهة', 'style', 'design', 'موقع', 'ويب', 'frontend', 'جميل'],
    starterFiles: {
      'tailwind.config.js': `module.exports = {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
`,
    },
  },
  {
    url: 'https://github.com/chartjs/Chart.js',
    name: 'Chart.js', owner: 'chartjs', category: 'visualization',
    descAr: 'رسوم بيانية تفاعلية جميلة وسهلة التخصيص',
    install: { type: 'npm', pkg: 'chart.js' },
    keywords: ['رسوم', 'بيانية', 'chart', 'graph', 'dashboard', 'إحصائيات', 'بيانات', 'visualization', 'لوحة تحكم', 'analytics'],
    starterFiles: {
      'chart-example.html': `<canvas id="myChart"></canvas>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
new Chart(document.getElementById('myChart'), {
  type: 'bar',
  data: {
    labels: ['جانفي','فيفري','مارس','أفريل'],
    datasets: [{ label: 'البيانات', data: [12,19,3,5], backgroundColor: 'rgba(16,163,127,0.7)' }]
  }
})
</script>
`,
    },
  },
  {
    url: 'https://github.com/n8n-io/n8n',
    name: 'n8n', owner: 'n8n-io', category: 'automation',
    descAr: 'أتمتة المهام والخدمات والذكاء الاصطناعي بدون كود',
    install: { type: 'npm', pkg: 'n8n' },
    keywords: ['أتمتة', 'automation', 'workflow', 'task', 'مهام', 'خدمات', 'ربط', 'integration', 'no-code'],
    starterFiles: {
      'README.md': '# n8n Automation\n\n## Run\n```bash\nnpx n8n start\n```\nافتح: http://localhost:5678\n',
    },
  },
  {
    url: 'https://github.com/microsoft/monaco-editor',
    name: 'Monaco Editor', owner: 'microsoft', category: 'ui',
    descAr: 'محرر أكواد VS Code كامل داخل المتصفح مباشرةً',
    install: { type: 'npm', pkg: '@monaco-editor/react' },
    keywords: ['محرر', 'كود', 'editor', 'code', 'ide', 'syntax', 'برمجة', 'تطبيق برمجة', 'نص كود'],
    starterFiles: {
      'CodeEditor.jsx': `import Editor from '@monaco-editor/react'
export default function CodeEditor() {
  return (
    <Editor height="90vh" defaultLanguage="python"
      defaultValue="# اكتب كودك هنا\nprint('مرحبا 🇩🇿')" theme="vs-dark" />
  )
}
`,
    },
  },
  {
    url: 'https://github.com/pocketbase/pocketbase',
    name: 'PocketBase', owner: 'pocketbase', category: 'database',
    descAr: 'Backend خفيف في ملف واحد: قاعدة بيانات + مصادقة + ملفات',
    install: { type: 'npm', pkg: 'pocketbase' },
    keywords: ['backend', 'database', 'auth', 'قاعدة بيانات', 'مصادقة', 'خادم خفيف', 'تطبيق صغير'],
    starterFiles: {
      'client.js': `import PocketBase from 'pocketbase'
const pb = new PocketBase('http://127.0.0.1:8090')
export async function login(email, password) {
  return await pb.collection('users').authWithPassword(email, password)
}
export async function getItems() {
  return await pb.collection('items').getFullList({ sort: '-created' })
}
`,
    },
  },
  {
    url: 'https://github.com/framer/motion',
    name: 'Framer Motion', owner: 'framer', category: 'ui',
    descAr: 'أنيميشن احترافي سلس لـ React بسطور قليلة',
    install: { type: 'npm', pkg: 'framer-motion' },
    keywords: ['أنيميشن', 'animation', 'react', 'motion', 'حركة', 'تحريك', 'واجهة', 'جميل', 'سلس'],
    starterFiles: {
      'AnimatedCard.jsx': `import { motion } from 'framer-motion'
export default function AnimatedCard({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }} whileHover={{ scale: 1.02 }}>
      {children}
    </motion.div>
  )
}
`,
    },
  },
  {
    url: 'https://github.com/mrdoob/three.js',
    name: 'Three.js', owner: 'mrdoob', category: 'visualization',
    descAr: 'رسوم ثلاثية الأبعاد تفاعلية مباشرةً في المتصفح',
    install: { type: 'npm', pkg: 'three' },
    keywords: ['ثلاثي', '3d', 'three', 'webgl', 'رسوم', 'جرافيكس', 'لعبة', 'محاكاة', 'عرض ثلاثي'],
    starterFiles: {
      'scene.js': `import * as THREE from 'three'
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer()
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)
const geometry = new THREE.BoxGeometry()
const material = new THREE.MeshBasicMaterial({ color: 0x10a37f })
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)
camera.position.z = 5
function animate() { requestAnimationFrame(animate); cube.rotation.x += 0.01; renderer.render(scene, camera) }
animate()
`,
    },
  },
]

export const CATEGORY_LABELS = {
  media: 'وسائط', ai: 'ذكاء اصطناعي', web: 'ويب',
  database: 'قواعد بيانات', automation: 'أتمتة',
  ui: 'واجهات', visualization: 'بيانات وعرض',
}

export const CATEGORY_ICONS = {
  media: '🎬', ai: '🤖', web: '🌐', database: '🗄️',
  automation: '⚙️', ui: '🎨', visualization: '📊',
}

export function matchReposToProject(message) {
  const lower = message.toLowerCase()
  const projectRe = /أريد|أبني|أنشئ|أصنع|أطور|اعمل|ابني|انشئ|بناء|إنشاء|مشروع|موقع|تطبيق|برنامج|build|create|make|develop|project/i
  if (!projectRe.test(message)) return []
  return SMART_REPOS.map(repo => {
    const score = repo.keywords.reduce((acc, kw) => acc + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0)
    return { ...repo, score }
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)
}

export function getRepoByName(name) {
  const n = name.toLowerCase()
  return SMART_REPOS.find(r => r.name.toLowerCase() === n || r.url.toLowerCase().includes(n)) || null
}
