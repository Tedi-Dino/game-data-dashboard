const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8770;
const ROOT = path.resolve(__dirname, '../..');

function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
            const ext = path.extname(filePath);
            const types = {
                '.html': 'text/html', '.js': 'application/javascript',
                '.css': 'text/css', '.json': 'application/json',
            };
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, {
                    'Content-Type': types[ext] || 'application/octet-stream',
                    'Cache-Control': 'public, max-age=31536000',
                });
                res.end(data);
            });
        });
        server.listen(PORT, () => resolve(server));
    });
}

async function measureLoad(browser) {
    const page = await browser.newPage();
    await page.setCacheEnabled(true);

    // Inject timing instrumentation
    await page.evaluateOnNewDocument(() => {
        window.__startTime = performance.now();
        window.__events = {};

        // Watch for skeleton class removal
        const bodyObserver = new MutationObserver(() => {
            if (!document.body.classList.contains('skeleton-loading') && !window.__events.skeletonRemoved) {
                window.__events.skeletonRemoved = performance.now() - window.__startTime;
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            window.__events.domContentLoaded = performance.now() - window.__startTime;
            bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

            // Watch for KPI text change
            const kpiEl = document.getElementById('total-actual-cost');
            if (kpiEl) {
                const kpiObserver = new MutationObserver(() => {
                    const text = kpiEl.textContent;
                    if (text && text !== '加载中...' && !window.__events.kpiReady) {
                        window.__events.kpiReady = performance.now() - window.__startTime;
                    }
                });
                kpiObserver.observe(kpiEl, { childList: true, subtree: true, characterData: true });
            }
        });
    });

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load', timeout: 90000 });

    // Wait until KPI is populated
    try {
        await page.waitForFunction(() => {
            const el = document.getElementById('total-actual-cost');
            return el && el.textContent && el.textContent !== '加载中...';
        }, { timeout: 30000 });
    } catch {
        // timeout is ok, we'll read whatever we have
    }
    await new Promise(r => setTimeout(r, 200));

    const timings = await page.evaluate(() => {
        const nav = performance.timing;
        return {
            ...window.__events,
            loadEvent: nav.loadEventEnd - nav.navigationStart,
        };
    });

    await page.close();
    return timings;
}

async function run() {
    const server = await startServer();
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

    // --- Cold: first visit (no IndexedDB) ---
    console.log('=== COLD (first visit, no IndexedDB cache) ===');
    const cold = await measureLoad(browser);
    console.log(`  Load event:       ${cold.loadEvent}ms`);
    console.log(`  DCL:              ${Math.round(cold.domContentLoaded || 0)}ms`);
    console.log(`  Skeleton removed: ${cold.skeletonRemoved ? Math.round(cold.skeletonRemoved) : 'N/A'}ms`);
    console.log(`  KPI ready:        ${cold.kpiReady ? Math.round(cold.kpiReady) : 'N/A'}ms`);

    // --- Warm: subsequent visits (with IndexedDB cache) ---
    console.log('\n=== WARM (subsequent visits, IndexedDB cache) ===');
    const warmResults = [];

    for (let i = 0; i < 5; i++) {
        const warm = await measureLoad(browser);
        warmResults.push(warm);
        console.log(`  Warm ${i+1}: Load ${warm.loadEvent}ms | Skeleton ${warm.skeletonRemoved ? Math.round(warm.skeletonRemoved) : 'N/A'}ms | KPI ${warm.kpiReady ? Math.round(warm.kpiReady) : 'N/A'}ms`);
    }

    const avg = (key) => {
        const vals = warmResults.map(r => r[key]).filter(v => v != null);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };

    console.log('\n=== AVERAGE WARM ===');
    console.log(`  Load event:       ${avg('loadEvent')}ms`);
    console.log(`  DCL:              ${avg('domContentLoaded')}ms`);
    console.log(`  Skeleton removed: ${avg('skeletonRemoved') ?? 'N/A'}ms`);
    console.log(`  KPI ready:        ${avg('kpiReady') ?? 'N/A'}ms`);

    console.log('\n=== COMPARISON ===');
    const coldKpi = cold.kpiReady ? Math.round(cold.kpiReady) : null;
    const warmKpi = avg('kpiReady');
    const coldSkel = cold.skeletonRemoved ? Math.round(cold.skeletonRemoved) : null;
    const warmSkel = avg('skeletonRemoved');

    if (coldKpi && warmKpi) {
        console.log(`  KPI ready:        ${coldKpi}ms → ${warmKpi}ms (${coldKpi - warmKpi}ms saved, ${Math.round((1 - warmKpi/coldKpi)*100)}% faster)`);
    }
    if (coldSkel && warmSkel) {
        console.log(`  Skeleton removed: ${coldSkel}ms → ${warmSkel}ms (${coldSkel - warmSkel}ms saved, ${Math.round((1 - warmSkel/coldSkel)*100)}% faster)`);
    }

    await browser.close();
    server.close();
}

run().catch(console.error);
