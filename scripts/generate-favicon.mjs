import sharp from 'sharp'
import toIco from 'to-ico'
import { writeFileSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

const svgIcon = readFileSync(path.join(publicDir, 'icon.svg'))

const png16 = await sharp(svgIcon).resize(16, 16).png().toBuffer()
const png32 = await sharp(svgIcon).resize(32, 32).png().toBuffer()
const png48 = await sharp(svgIcon).resize(48, 48).png().toBuffer()

const ico = await toIco([png16, png32, png48])
writeFileSync(path.join(publicDir, 'favicon.ico'), ico)
console.log('Generated favicon.ico (16x16, 32x32, 48x48)')
