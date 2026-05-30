const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8768;
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

async function run() {
    const server = await startServer();
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setCacheEnabled(true);

    // First load to warm cache
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'load', timeout: 90000 });
    await new Promise(r => setTimeout(r, 500));

    // Second load - measure warm in detail
    await page.reload({ waitUntil: 'load', timeout: 90000 });
    await new Promise(r => setTimeout(r, 1000));

    const data = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');

        // Navigation timing breakdown
        const navTiming = {
            // DNS + TCP + TLS (should be 0 for cached)
            dns: nav.domainLookupEnd - nav.domainLookupStart,
            tcp: nav.connectEnd - nav.connectStart,
            tls: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
            // Request/Response
            ttfb: nav.responseStart - nav.requestStart,
            response: nav.responseEnd - nav.responseStart,
            // Parsing
            domParsing: nav.domInteractive - nav.domLoading,
            domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
            // Script execution
            scriptExecution: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
            // DOM complete
            domComplete: nav.domComplete - nav.domInteractive,
            // Load event
            loadEvent: nav.loadEventEnd - nav.loadEventStart,
            // Full timeline
            total: nav.loadEventEnd - nav.startTime,

            // Key milestones from start
            startTime: nav.startTime,
            domLoading: nav.domLoading - nav.startTime,
            domInteractive: nav.domInteractive - nav.startTime,
            domContentLoadedStart: nav.domContentLoadedEventStart - nav.startTime,
            domContentLoadedEnd: nav.domContentLoadedEventEnd - nav.startTime,
            domCompleteAt: nav.domComplete - nav.startTime,
            loadEventEnd: nav.loadEventEnd - nav.startTime,
        };

        // Paint timing
        const paints = performance.getEntriesByType('paint');
        const paintTiming = {};
        paints.forEach(p => { paintTiming[p.name] = Math.round(p.startTime); });

        // Long tasks (if available via PerformanceObserver, won't work here but check resources)
        const allResources = resources
            .map(r => ({
                name: r.name.length > 90 ? '...' + r.name.slice(-87) : r.name,
                type: r.initiatorType,
                start: Math.round(r.startTime),
                duration: Math.round(r.duration),
                size: r.transferSize || 0,
                cached: r.transferSize === 0 && r.decodedBodySize > 0,
                decodedSize: r.decodedBodySize,
                domain: new URL(r.name).hostname,
            }))
            .sort((a, b) => a.start - b.start);

        // Find resources that are NOT cached
        const networkResources = allResources.filter(r => !r.cached);
        const cachedResources = allResources.filter(r => r.cached);

        // Find the "long pole" - what determines when DCL and Load happen
        const dclTime = nav.domContentLoadedEventEnd - nav.startTime;
        const loadTime = nav.loadEventEnd - nav.startTime;

        // Resources still loading at DCL
        const atDCL = allResources.filter(r => r.start < dclTime && r.start + r.duration > dclTime);
        // Resources still loading at Load
        const atLoad = allResources.filter(r => r.start < loadTime && r.start + r.duration > loadTime);

        return {
            navTiming,
            paintTiming,
            totalResources: allResources.length,
            cachedCount: cachedResources.length,
            networkCount: networkResources.length,
            networkResources,
            allResources,
            atDCL,
            atLoad,
        };
    });

    console.log('=== NAVIGATION TIMING BREAKDOWN (warm reload) ===\n');
    const nt = data.navTiming;

    // Visual timeline
    console.log('Timeline:');
    console.log(`  0ms        ┌─ request ── TTFB ${nt.ttfb}ms`);
    console.log(`  ${nt.ttfb}ms        ├─ response ${nt.response}ms`);
    console.log(`  ${Math.round(nt.domLoading)}ms        ├─ DOM parsing ${nt.domParsing}ms`);
    console.log(`  ${Math.round(nt.domInteractive)}ms        ├─ DCL processing ${nt.domContentLoaded}ms`);
    console.log(`  ${Math.round(nt.domContentLoadedEnd)}ms        ├─ DOM complete ${nt.domComplete}ms`);
    console.log(`  ${Math.round(nt.domCompleteAt)}ms        └─ Load event ${nt.loadEvent}ms`);
    console.log(`  ${Math.round(nt.loadEventEnd)}ms        END\n`);

    console.log('Detailed:');
    console.log(`  DNS lookup:          ${nt.dns}ms`);
    console.log(`  TCP connect:         ${nt.tcp}ms`);
    console.log(`  TLS:                 ${nt.tls}ms`);
    console.log(`  TTFB:                ${nt.ttfb}ms`);
    console.log(`  Response transfer:   ${nt.response}ms`);
    console.log(`  DOM parsing:         ${nt.domParsing}ms`);
    console.log(`  DCL handler:         ${nt.domContentLoaded}ms`);
    console.log(`  DOM complete:        ${nt.domComplete}ms`);
    console.log(`  Load event:          ${nt.loadEvent}ms`);
    console.log(`  Total:               ${nt.total}ms`);

    console.log('\n=== PAINT TIMING ===');
    Object.entries(data.paintTiming).forEach(([name, time]) => {
        console.log(`  ${name}: ${time}ms`);
    });

    console.log(`\n=== RESOURCES: ${data.totalResources} total (${data.cachedCount} cached, ${data.networkCount} from network) ===`);

    if (data.networkResources.length > 0) {
        console.log('\nResources fetched from network (not cached):');
        data.networkResources.forEach(r => {
            console.log(`  [${r.start}ms +${r.duration}ms] ${r.type.padEnd(10)} ${r.domain.padEnd(25)} ${r.name}`);
        });
    } else {
        console.log('\nAll resources served from cache.');
    }

    // Show what's slow even from cache
    console.log('\n=== ALL RESOURCES BY DURATION (even cached takes time to decode/execute) ===');
    data.allResources
        .filter(r => r.duration > 1)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 15)
        .forEach((r, i) => {
            const cacheTag = r.cached ? 'cached' : 'network';
            console.log(`  ${i+1}. ${String(r.duration).padStart(4)}ms | ${cacheTag.padEnd(7)} | ${r.type.padEnd(10)} | ${r.domain} | ${r.name}`);
        });

    console.log(`\n=== Blocking resources at DCL (${Math.round(nt.domContentLoadedEnd)}ms) ===`);
    if (data.atDCL.length > 0) {
        data.atDCL.forEach(r => {
            console.log(`  ${r.name} (${r.type}, started ${r.start}ms, ${r.duration}ms, ${r.cached ? 'cached' : 'network'})`);
        });
    } else {
        console.log('  None');
    }

    console.log(`\n=== Blocking resources at Load (${Math.round(nt.loadEventEnd)}ms) ===`);
    if (data.atLoad.length > 0) {
        data.atLoad.forEach(r => {
            console.log(`  ${r.name} (${r.type}, started ${r.start}ms, ${r.duration}ms, ${r.cached ? 'cached' : 'network'})`);
        });
    } else {
        console.log('  None');
    }

    // Find what Firebase does after load
    console.log('\n=== POST-LOAD ACTIVITY (> loadEventEnd) ===');
    const postLoad = data.allResources.filter(r => r.start > data.navTiming.loadEventEnd);
    if (postLoad.length > 0) {
        postLoad.forEach(r => {
            console.log(`  [${r.start}ms +${r.duration}ms] ${r.type.padEnd(10)} ${r.domain} | ${r.name}`);
        });
    } else {
        console.log('  None');
    }

    await browser.close();
    server.close();
}

run().catch(console.error);
