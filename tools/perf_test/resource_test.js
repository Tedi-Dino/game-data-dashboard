const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8766;
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
                res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
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
    await page.setCacheEnabled(false);

    // Intercept all resource timings via CDP
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load', timeout: 90000 });
    await new Promise(r => setTimeout(r, 1000));

    const data = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const nav = performance.getEntriesByType('navigation')[0];

        // Sort by start time
        const sorted = resources
            .map(r => ({
                name: r.name.length > 80 ? '...' + r.name.slice(-77) : r.name,
                fullUrl: r.name,
                type: r.initiatorType,
                start: Math.round(r.startTime),
                duration: Math.round(r.duration),
                size: r.transferSize || 0,
                domain: new URL(r.name).hostname,
            }))
            .sort((a, b) => a.start - b.start);

        // Group by domain
        const byDomain = {};
        sorted.forEach(r => {
            if (!byDomain[r.domain]) byDomain[r.domain] = { count: 0, totalDuration: 0, totalSize: 0, resources: [] };
            byDomain[r.domain].count++;
            byDomain[r.domain].totalDuration += r.duration;
            byDomain[r.domain].totalSize += r.size;
            byDomain[r.domain].resources.push(r);
        });

        // Group by type
        const byType = {};
        sorted.forEach(r => {
            if (!byType[r.type]) byType[r.type] = { count: 0, totalDuration: 0, totalSize: 0 };
            byType[r.type].count++;
            byType[r.type].totalDuration += r.duration;
            byType[r.type].totalSize += r.size;
        });

        return {
            navigation: {
                ttfb: Math.round(nav.responseStart - nav.requestStart),
                domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
                domComplete: Math.round(nav.domComplete - nav.startTime),
                loadEvent: Math.round(nav.loadEventEnd - nav.startTime),
            },
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
            allResources: sorted,
            byDomain,
            byType,
        };
    });

    console.log('\n=== NAVIGATION TIMING ===');
    console.log(`TTFB:               ${data.navigation.ttfb}ms`);
    console.log(`FCP:                ${Math.round(data.fcp)}ms`);
    console.log(`DOM Content Loaded: ${data.navigation.domContentLoaded}ms`);
    console.log(`DOM Complete:       ${data.navigation.domComplete}ms`);
    console.log(`Load Event:         ${data.navigation.loadEvent}ms`);

    console.log('\n=== BY DOMAIN (sorted by total duration) ===');
    const domainEntries = Object.entries(data.byDomain).sort((a, b) => b[1].totalDuration - a[1].totalDuration);
    domainEntries.forEach(([domain, info]) => {
        console.log(`\n  ${domain}`);
        console.log(`    Resources: ${info.count} | Total Duration: ${info.totalDuration}ms | Size: ${(info.totalSize / 1024).toFixed(1)}KB`);
        info.resources.forEach(r => {
            console.log(`      [${r.start}ms +${r.duration}ms ${(r.size/1024).toFixed(1)}KB] ${r.type.padEnd(10)} ${r.name}`);
        });
    });

    console.log('\n=== BY TYPE ===');
    Object.entries(data.byType)
        .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
        .forEach(([type, info]) => {
            console.log(`  ${type.padEnd(12)} ${info.count} resources | ${info.totalDuration}ms total | ${(info.totalSize/1024).toFixed(1)}KB`);
        });

    console.log('\n=== TOP 10 SLOWEST RESOURCES ===');
    data.allResources
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
        .forEach((r, i) => {
            console.log(`  ${i+1}. ${r.duration}ms | ${(r.size/1024).toFixed(1)}KB | ${r.type.padEnd(10)} | ${r.name}`);
        });

    await browser.close();
    server.close();
}

run().catch(console.error);
