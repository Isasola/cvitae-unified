import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { jsPDF } from 'jspdf'

const outputDir = resolve('tmp', 'b2b-pdf-fixtures')
mkdirSync(outputDir, { recursive: true })

const roles = [
  ['Frontend', 'React, TypeScript, accesibilidad, pruebas y optimización web'],
  ['Backend', 'Node.js, PostgreSQL, APIs REST, seguridad y observabilidad'],
  ['Datos', 'Python, SQL, Power BI, estadística y calidad de datos'],
  ['Producto', 'investigación, métricas, roadmap, experimentación y facilitación'],
  ['Marketing', 'SEO, pauta digital, analítica, contenidos y automatización'],
]

function writePdf(fileName: string, lines: string[]) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setFontSize(12)
  pdf.text(pdf.splitTextToSize(lines.join('\n'), 170), 20, 20)
  writeFileSync(resolve(outputDir, fileName), Buffer.from(pdf.output('arraybuffer')))
}

for (let index = 0; index < 30; index += 1) {
  const [area, skills] = roles[index % roles.length]
  writePdf(`cv-${String(index + 1).padStart(2, '0')}-${area.toLowerCase()}.pdf`, [
    `Candidata QA ${String(index + 1).padStart(2, '0')}`,
    `Profesional de ${area} con ${2 + (index % 8)} años de experiencia.`,
    `Competencias: ${skills}.`,
    `Logro verificable: mejoró un indicador operativo en ${12 + index} por ciento.`,
    'Educación universitaria completa. Español nativo e inglés intermedio.',
    'Este documento contiene información ficticia creada exclusivamente para QA de CVitae.',
  ])
}

writePdf('caso-pdf-sin-texto-suficiente.pdf', ['QA'])
writeFileSync(resolve(outputDir, 'caso-pdf-corrupto.pdf'), Buffer.from('esto no es un PDF'))
writeFileSync(resolve(outputDir, 'caso-formato-no-admitido.doc'), Buffer.from('Documento binario simulado'))
writeFileSync(resolve(outputDir, 'caso-mayor-4mb.pdf'), Buffer.concat([
  Buffer.from('%PDF-1.4\n% fixture de tamaño para rechazo temprano\n'),
  Buffer.alloc((4 * 1024 * 1024) + 1, 0x20),
]))

console.log(`Fixtures B2B creados en ${outputDir}: 30 CVs válidos + 4 casos negativos.`)
