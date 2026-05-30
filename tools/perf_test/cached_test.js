const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8767;
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
                // Add cache headers for local files
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

async function run() {
    const server = await startServer();
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();

    // --- Run 1: Cold (no cache) ---
    console.log('=== COLD LOAD (no cache) ===');
    await page.setCacheEnabled(false);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load', timeout: 90000 });
    await new Promise(r => setTimeout(r, 500));

    const cold = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        return {
            ttfb: Math.round(nav.responseStart - nav.requestStart),
            fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
            dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            load: Math.round(nav.loadEventEnd - nav.startTime),
            resources: resources.length,
            byDomain: groupByDomain(resources),
        };

        function groupByDomain(resources) {
            const map = {};
            resources.forEach(r => {
                const domain = new URL(r.name).hostname;
                if (!map[domain]) map[domain] = { count: 0, duration: 0, size: 0 };
                map[domain].count++;
                map[domain].duration += Math.round(r.duration);
                map[domain].size += r.transferSize || 0;
            });
            return map;
        }
    });

    console.log(`  FCP: ${cold.fcp}ms | DCL: ${cold.dcl}ms | Load: ${cold.load}ms | Resources: ${cold.resources}`);
    console.log('  Domain breakdown:');
    Object.entries(cold.byDomain)
        .sort((a, b) => b[1].duration - a[1].duration)
        .forEach(([domain, info]) => {
            console.log(`    ${domain.padEnd(25)} ${info.count} res | ${info.duration}ms | ${(info.size/1024).toFixed(1)}KB`);
        });

    // --- Run 2-6: Warm (cache enabled, same page session) ---
    console.log('\n=== WARM LOADS (browser cache enabled) ===');
    await page.setCacheEnabled(true);

    const warmResults = [];
    for (let i = 0; i < 5; i++) {
        // Reload the page (cache should kick in)
        await page.reload({ waitUntil: 'load', timeout: 90000 });
        await new Promise(r => setTimeout(r, 300));

        const warm = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const resources = performance.getEntriesByType('resource');
            return {
                ttfb: Math.round(nav.responseStart - nav.requestStart),
                fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
                dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
                load: Math.round(nav.loadEventEnd - nav.startTime),
                resources: resources.length,
                fromCache: resources.filter(r => r.transferSize === 0 && r.decodedBodySize > 0).length,
                fromNetwork: resources.filter(r => r.transferSize > 0).length,
                byDomain: groupByDomain(resources),
            };

            function groupByDomain(resources) {
                const map = {};
                resources.forEach(r => {
                    const domain = new URL(r.name).hostname;
                    if (!map[domain]) map[domain] = { count: 0, duration: 0, size: 0, cached: 0 };
                    map[domain].count++;
                    map[domain].duration += Math.round(r.duration);
                    map[domain].size += r.transferSize || 0;
                    if (r.transferSize === 0 && r.decodedBodySize > 0) map[domain].cached++;
                });
                return map;
            }
        });

        warmResults.push(warm);
        console.log(`  Warm ${i+1}: FCP ${warm.fcp}ms | DCL ${warm.dcl}ms | Load ${warm.load}ms | Cached: ${warm.fromCache}/${warm.resources} | Network: ${warm.fromNetwork}`);
    }

    // Average warm results
    const avgWarm = {
        fcp: Math.round(warmResults.reduce((s, r) => s + r.fcp, 0) / warmResults.length),
        dcl: Math.round(warmResults.reduce((s, r) => s + r.dcl, 0) / warmResults.length),
        load: Math.round(warmResults.reduce((s, r) => s + r.load, 0) / warmResults.length),
        fromCache: Math.round(warmResults.reduce((s, r) => s + r.fromCache, 0) / warmResults.length),
        fromNetwork: Math.round(warmResults.reduce((s, r) => s + r.fromNetwork, 0) / warmResults.length),
        byDomain: warmResults[warmResults.length - 1].byDomain,
    };

    console.log('\n=== AVERAGE WARM ===');
    console.log(`  FCP: ${avgWarm.fcp}ms | DCL: ${avgWarm.dcl}ms | Load: ${avgWarm.load}ms`);
    console.log(`  From Cache: ${avgWarm.fromCache} / ${warmResults[0].resources} resources`);

    // Show domain breakdown for warm
    console.log('\n=== WARM DOMAIN BREAKDOWN (last run) ===');
    Object.entries(avgWarm.byDomain)
        .sort((a, b) => b[1].duration - a[1].duration)
        .forEach(([domain, info]) => {
            console.log(`  ${domain.padEnd(25)} ${info.count} res | ${info.duration}ms | ${info.cached}/${info.count} cached`);
        });

    // Comparison
    console.log('\n=== COLD vs WARM COMPARISON ===');
    console.log(`  FCP:    ${cold.fcp}ms → ${avgWarm.fcp}ms (${cold.fcp - avgWarm.fcp}ms saved, ${Math.round((1 - avgWarm.fcp/cold.fcp)*100)}% faster)`);
    console.log(`  DCL:    ${cold.dcl}ms → ${avgWarm.dcl}ms (${cold.dcl - avgWarm.dcl}ms saved, ${Math.round((1 - avgWarm.dcl/cold.dcl)*100)}% faster)`);
    console.log(`  Load:   ${cold.load}ms → ${avgWarm.load}ms (${cold.load - avgWarm.load}ms saved, ${Math.round((1 - avgWarm.load/cold.load)*100)}% faster)`);

    await browser.close();
    server.close();
}

run().catch(console.error);
