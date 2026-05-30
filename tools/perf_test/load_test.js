const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const RUNS = 10;
const ROOT = path.resolve(__dirname, '../..');

// Simple static file server
function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
            const ext = path.extname(filePath);
            const types = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
            };
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
                res.end(data);
            });
        });
        server.listen(PORT, () => resolve(server));
    });
}

async function run() {
    const server = await startServer();
    console.log(`Server started on http://localhost:${PORT}`);
    console.log(`Running ${RUNS} load tests...\n`);

    const results = [];

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (let i = 0; i < RUNS; i++) {
        const page = await browser.newPage();

        // Clear cache between runs
        await page.setCacheEnabled(false);

        const startTime = Date.now();

        // Navigate with 'load' event (not networkidle which hangs on Firebase)
        await page.goto(`http://localhost:${PORT}`, {
            waitUntil: 'load',
            timeout: 90000,
        });

        // Wait a bit for paint to settle
        await new Promise(r => setTimeout(r, 500));

        const loadTime = Date.now() - startTime;

        // Get detailed performance metrics
        const perfMetrics = await page.evaluate(() => {
            const timing = performance.timing;
            const resources = performance.getEntriesByType('resource');

            // Group resources by type
            const resourceBreakdown = {};
            resources.forEach(r => {
                const ext = r.name.split('?')[0].split('.').pop().toLowerCase();
                const type = ['js'].includes(ext) ? 'script' :
                    ['css'].includes(ext) ? 'stylesheet' :
                        ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'ico'].includes(ext) ? 'image' :
                            ['woff', 'woff2', 'ttf', 'eot'].includes(ext) ? 'font' : 'other';
                resourceBreakdown[type] = (resourceBreakdown[type] || 0) + 1;
            });

            return {
                // Core timing milestones
                ttfb: timing.responseStart - timing.requestStart,
                domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
                domComplete: timing.domComplete - timing.navigationStart,
                fullLoad: timing.loadEventEnd - timing.navigationStart,

                // Resource stats
                resourceCount: resources.length,
                resourceBreakdown,

                // Total transfer size (approximate)
                totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),

                // Paint timing
                firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
                firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
            };
        });

        results.push({
            run: i + 1,
            wallClock: loadTime,
            ...perfMetrics,
        });

        console.log(
            `Run ${i + 1}/${RUNS}: ` +
            `Wall ${loadTime}ms | ` +
            `FCP ${Math.round(perfMetrics.firstContentfulPaint)}ms | ` +
            `DCL ${Math.round(perfMetrics.domContentLoaded)}ms | ` +
            `Load ${Math.round(perfMetrics.fullLoad)}ms | ` +
            `Resources: ${perfMetrics.resourceCount}`
        );

        await page.close();
    }

    await browser.close();
    server.close();

    // Calculate averages
    const avg = (key) => results.reduce((s, r) => s + (r[key] || 0), 0) / results.length;
    const fmt = (v) => Math.round(v);

    // Aggregate resource breakdown from last run
    const lastBreakdown = results[results.length - 1].resourceBreakdown;

    const summary = {
        runs: RUNS,
        avgWallClock: fmt(avg('wallClock')),
        avgTTFB: fmt(avg('ttfb')),
        avgFCP: fmt(avg('firstContentfulPaint')),
        avgDOMContentLoaded: fmt(avg('domContentLoaded')),
        avgDomComplete: fmt(avg('domComplete')),
        avgFullLoad: fmt(avg('fullLoad')),
        avgResourceCount: fmt(avg('resourceCount')),
        avgTransferSizeKB: fmt(avg('totalTransferSize') / 1024),
        min: Math.min(...results.map(r => r.wallClock)),
        max: Math.max(...results.map(r => r.wallClock)),
        resourceBreakdown: lastBreakdown,
    };

    console.log('\n' + '='.repeat(60));
    console.log('LOAD TIME SUMMARY (10 runs average)');
    console.log('='.repeat(60));
    console.log(`Avg Wall Clock:         ${summary.avgWallClock}ms`);
    console.log(`Avg TTFB:               ${summary.avgTTFB}ms`);
    console.log(`Avg FCP:                ${summary.avgFCP}ms`);
    console.log(`Avg DOM Content Loaded: ${summary.avgDOMContentLoaded}ms`);
    console.log(`Avg DOM Complete:       ${summary.avgDomComplete}ms`);
    console.log(`Avg Full Load:          ${summary.avgFullLoad}ms`);
    console.log(`Avg Resource Count:     ${summary.avgResourceCount}`);
    console.log(`Avg Transfer Size:      ${summary.avgTransferSizeKB}KB`);
    console.log(`Min Wall Clock:         ${summary.min}ms`);
    console.log(`Max Wall Clock:         ${summary.max}ms`);
    console.log('-'.repeat(60));
    console.log('Resource Breakdown:');
    Object.entries(lastBreakdown).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
    });
    console.log('='.repeat(60));

    // Save results to JSON
    const output = { summary, details: results };
    const outputPath = path.join(__dirname, 'results.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nDetailed results saved to: ${outputPath}`);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
