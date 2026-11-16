const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.post('/api/pro/buscar-dni', async (req, res) => {
    const { dni } = req.body;

    if (!dni || dni.length !== 8) {
        return res.status(400).json({ success: false, error: 'DNI inválido o incompleto.' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Ir a la página
        await page.goto('https://k1.pe/prueba-gratis', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 1. Escribir DNI y hacer clic en consultar
        await page.waitForSelector('#dniGratis', { timeout: 10000 });
        await page.type('#dniGratis', dni);
        await page.click('#submitBtn');

        // 2. Esperar de forma segura a que cargue la respuesta (espera hasta 8 segundos a que aparezca contenido de resultado o tabla)
        try {
            await page.waitForFunction(
                () => document.body.innerText.includes('RESULTADO') || document.body.innerText.includes('Nombres completos') || document.body.innerText.includes('No encontrado'),
                { timeout: 8000 }
            );
        } catch (e) {
            // Si pasa el tiempo y no aparece el texto clave, continuamos de todos modos para capturar lo que haya en pantalla
        }

        // 3. Extraer texto e imágenes de manera tolerante a fallos
        const datosExtraidos = await page.evaluate(() => {
            const tablaResultados = document.querySelector('table') || document.querySelector('.resultado') || document.querySelector('#resultado');
            
            let textoTabla = "";
            if (tablaResultados) {
                textoTabla = tablaResultados.innerText;
            } else {
                const bodyText = document.body.innerText;
                const indexInicio = bodyText.indexOf("RESULTADO RENIEC");
                if (indexInicio !== -1) {
                    textoTabla = bodyText.substring(indexInicio);
                } else {
                    // Si no encuentra los resultados, devolvemos un mensaje indicando que no se hallaron datos para ese DNI
                    textoTabla = "[!] No se encontraron datos para este DNI o la consulta no arrojó resultados.";
                }
            }

            const imagenes = Array.from(document.querySelectorAll('img')).map(img => img.src);
            const fotoUrl = imagenes.find(src => src.includes('foto') || src.length > 100) || '';
            const firmaUrl = imagenes.find(src => src.includes('firma') || (src !== fotoUrl && src.length > 100)) || '';

            return {
                texto: textoTabla,
                foto: fotoUrl,
                firma: firmaUrl
            };
        });

        await browser.close();

        // 4. Formatear salida limpia
        let htmlFinal = `<pre style="white-space: pre-wrap; font-family: monospace; color: #38bdf8;">${datosExtraidos.texto}</pre>`;
        
        if (datosExtraidos.foto) {
            htmlFinal += `<div style="margin-top: 15px;"><b>Foto:</b><br><img src="${datosExtraidos.foto}" style="max-width: 150px; border-radius: 8px; border: 1px solid #38bdf8; margin-top: 5px;" /></div>`;
        }
        if (datosExtraidos.firma) {
            htmlFinal += `<div style="margin-top: 15px;"><b>Firma:</b><br><img src="${datosExtraidos.firma}" style="max-width: 200px; border-radius: 8px; border: 1px solid #38bdf8; background: white; padding: 5px; margin-top: 5px;" /></div>`;
        }

        return res.json({ success: true, resultado: htmlFinal });

    } catch (error) {
        if (browser) await browser.close();
        return res.status(200).json({ 
            success: true, 
            resultado: `<span style="color: #ef4444;">[!] Ocurrió un retraso o la página externa no respondió a tiempo para este DNI. Intenta nuevamente.</span>` 
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de automatización corriendo en http://localhost:${PORT}`);
});